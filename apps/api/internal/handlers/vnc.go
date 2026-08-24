package handlers

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/observability"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

const vncCloseWriteDeadline = 2 * time.Second

// VNCHandler handles VNC proxy and WebSocket bridge requests.
type VNCHandler struct {
	PX        *proxmox.Client
	Authz     vmAuthz
	Sessions  liveSessionValidator
	Telemetry *observability.Telemetry
	AppCtx    context.Context
	sessions  *sessionStore
	upgrader  websocket.Upgrader
}

// NewVNCHandler creates a VNCHandler with an initialized session store.
func NewVNCHandler(ctx context.Context, px *proxmox.Client, frontendURL string, tel *observability.Telemetry) *VNCHandler {
	allowedOrigin := middleware.NormalizeOrigin(frontendURL)
	return &VNCHandler{
		PX:        px,
		Telemetry: tel,
		AppCtx:    ctx,
		sessions:  newSessionStore(ctx),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := strings.TrimSpace(r.Header.Get("Origin"))
				if origin == "" {
					return false
				}
				return allowedOrigin != "" && middleware.NormalizeOrigin(origin) == allowedOrigin
			},
		},
	}
}

// --- session store ---

type vncSession struct {
	guestType   proxmox.GuestType
	node        string
	vmid        int
	port        string
	ticket      string
	password    string
	expires     time.Time
	principalID uuid.UUID
	itemID      uuid.UUID
}

type sessionStore struct {
	mu       sync.Mutex
	sessions map[string]*vncSession
}

func newSessionStore(ctx context.Context) *sessionStore {
	s := &sessionStore{sessions: make(map[string]*vncSession)}
	go s.reapLoop(ctx)
	return s
}

func (s *sessionStore) store(sess *vncSession) string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	id := hex.EncodeToString(b)

	s.mu.Lock()
	sess.expires = time.Now().Add(30 * time.Second)
	s.sessions[id] = sess
	s.mu.Unlock()
	return id
}

func (s *sessionStore) consume(id string) (*vncSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok || time.Now().After(sess.expires) {
		delete(s.sessions, id)
		return nil, false
	}
	delete(s.sessions, id)
	return sess, true
}

func (s *sessionStore) reapLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mu.Lock()
			now := time.Now()
			for id, sess := range s.sessions {
				if now.After(sess.expires) {
					delete(s.sessions, id)
				}
			}
			s.mu.Unlock()
		}
	}
}

// --- HTTP handlers ---

// PostProxy handles POST /api/v1/inventory/items/:id/vm/vnc/proxy.
// Calls the Proxmox vncproxy endpoint and returns a session ID + password.
func (h *VNCHandler) PostProxy(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.ConsoleVM, false)
	if !ok {
		return
	}

	vncResp, err := h.PX.CreateVNCProxy(c.Request.Context(), target.GuestType, target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create VNC proxy", "create vnc proxy", err)
		return
	}

	sessionID := h.sessions.store(&vncSession{
		guestType:   target.GuestType,
		node:        target.Node,
		vmid:        target.VMID,
		port:        vncResp.Port,
		ticket:      vncResp.Ticket,
		password:    vncResp.Password,
		principalID: principalID,
		itemID:      target.ItemID,
	})

	c.JSON(http.StatusOK, gin.H{
		"sessionId": sessionID,
		"password":  vncResp.Password,
	})
}

// --- WebSocket bridge ---

// WebSocket handles GET /api/v1/vnc/ws.
// The session ID is read from the ?sessionId query parameter.
func (h *VNCHandler) WebSocket(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	sessionID, ok := currentSessionID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if h.Sessions == nil || h.Authz == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vnc unavailable"})
		return
	}

	clientConn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "ws upgrade error", slog.String("error", err.Error()))
		return
	}
	defer clientConn.Close()

	sess, ok := h.sessions.consume(c.Query("sessionId"))
	if !ok {
		denyVNCConnection(clientConn)
		return
	}

	if sess.principalID != principalID {
		denyVNCConnection(clientConn)
		return
	}

	if err := h.Sessions.ValidateLiveSession(c.Request.Context(), sessionID, principalID); err != nil {
		slog.WarnContext(c.Request.Context(), "vnc session validation failed", slog.String("error", err.Error()))
		denyVNCConnection(clientConn)
		return
	}

	if err := h.Authz.Require(freshAuthzContext(c.Request.Context()), principalID, sess.itemID, authorization.ConsoleVM); err != nil {
		slog.WarnContext(c.Request.Context(), "vnc console authorization failed", slog.String("error", err.Error()))
		denyVNCConnection(clientConn)
		return
	}

	connectedAt := time.Now()
	var closeReason string
	if h.Telemetry != nil {
		h.Telemetry.Metrics().VNCConnections.Add(c.Request.Context(), 1)
	}
	defer func() {
		if h.Telemetry == nil {
			return
		}
		reason := closeReason
		if reason == "" {
			reason = classifyVNCCloseReason(h.AppCtx, c.Request.Context())
		}
		m := h.Telemetry.Metrics()
		ctx := c.Request.Context()
		m.VNCConnections.Add(ctx, -1)
		reasonAttr := metric.WithAttributes(attribute.String("close.reason", reason))
		m.VNCConnectionDuration.Record(ctx, time.Since(connectedAt).Seconds(), reasonAttr)
	}()

	// Build Proxmox WebSocket URL
	pxURL, err := url.Parse(h.PX.BaseURL())
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "bad proxmox base url", slog.String("error", err.Error()))
		closeReason = observability.CloseReasonUpstreamError
		return
	}
	scheme := "wss"
	if pxURL.Scheme == "http" {
		scheme = "ws"
	}
	wsURL := fmt.Sprintf("%s://%s/api2/json/nodes/%s/%s/%d/vncwebsocket?port=%s&vncticket=%s",
		scheme, pxURL.Host, sess.node, sess.guestType, sess.vmid, sess.port, url.QueryEscape(sess.ticket))

	dialer := websocket.Dialer{}
	if h.PX.Insecure() {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	pxHeaders := http.Header{}
	pxHeaders.Set("Authorization", h.PX.AuthHeader())

	dialCtx, span := trace.SpanFromContext(c.Request.Context()).TracerProvider().Tracer("kamino-api").Start(
		c.Request.Context(), "Proxmox VNC websocket", trace.WithSpanKind(trace.SpanKindClient),
	)
	pxConn, resp, err := dialer.DialContext(dialCtx, wsURL, pxHeaders)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "websocket dial failed")
		span.End()
		slog.ErrorContext(c.Request.Context(), "proxmox ws dial error", slog.String("error", err.Error()))
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to connect to VNC"))
		closeReason = observability.CloseReasonUpstreamError
		return
	}
	if resp != nil {
		span.SetAttributes(attribute.Int("http.response.status_code", resp.StatusCode))
	}
	span.End()
	defer pxConn.Close()

	watchCtx, cancelWatch := context.WithCancel(c.Request.Context())
	defer cancelWatch()

	var shutdownOnce sync.Once
	shutdown := func() {
		shutdownOnce.Do(func() {
			deadline := time.Now().Add(vncCloseWriteDeadline)
			_ = clientConn.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "session ended"), deadline)
			clientConn.Close()
			pxConn.Close()
			cancelWatch()
		})
	}

	watchdogRejected := make(chan struct{})
	watchdogStopped := make(chan struct{})
	go func() {
		defer close(watchdogStopped)
		ticker := time.NewTicker(liveCheckInterval)
		defer ticker.Stop()
		if err := h.watchAuthorization(watchCtx, sessionID, principalID, sess.itemID, ticker.C); err != nil {
			slog.WarnContext(watchCtx, "vnc watchdog authorization failed", slog.String("error", err.Error()))
			close(watchdogRejected)
		}
	}()

	bridgeBidirectional(watchCtx, clientConn, pxConn, watchdogRejected, shutdown, h.Telemetry)
	<-watchdogStopped
}

func classifyVNCCloseReason(appCtx, reqCtx context.Context) string {
	if appCtx != nil && appCtx.Err() != nil {
		return observability.CloseReasonServerShutdown
	}
	if reqCtx.Err() != nil {
		return observability.CloseReasonClientCancel
	}
	return observability.CloseReasonClientCancel
}

func denyVNCConnection(conn *websocket.Conn) {
	conn.WriteMessage(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid or expired session"))
}

// watchAuthorization rechecks the live session and ConsoleVM access every tick, failing closed on error.
func (h *VNCHandler) watchAuthorization(
	ctx context.Context,
	sessionID, principalID, itemID uuid.UUID,
	tick <-chan time.Time,
) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick:
			if err := h.Sessions.ValidateLiveSession(ctx, sessionID, principalID); err != nil {
				return err
			}
			if err := h.Authz.Require(freshAuthzContext(ctx), principalID, itemID, authorization.ConsoleVM); err != nil {
				return err
			}
		}
	}
}

// bridgeBidirectional bridges both directions until a copy loop, watchdog rejection, or ctx cancellation ends it.
func bridgeBidirectional(
	ctx context.Context,
	left, right *websocket.Conn,
	watchdogRejected <-chan struct{},
	shutdown func(),
	tel *observability.Telemetry,
) {
	copyDone := make(chan struct{}, 2)

	go func() {
		bridge(left, right, observability.VNCDirectionClientToUpstream, tel)
		copyDone <- struct{}{}
	}()

	go func() {
		bridge(right, left, observability.VNCDirectionUpstreamToClient, tel)
		copyDone <- struct{}{}
	}()

	doneCh := ctx.Done()
	rejectedCh := watchdogRejected
	received := 0
	for received < 2 {
		select {
		case <-copyDone:
			received++
			shutdown()
		case <-rejectedCh:
			rejectedCh = nil
			shutdown()
		case <-doneCh:
			doneCh = nil
			shutdown()
		}
	}
}

func bridge(src, dst *websocket.Conn, direction string, tel *observability.Telemetry) {
	for {
		msgType, r, err := src.NextReader()
		if err != nil {
			return
		}
		w, err := dst.NextWriter(msgType)
		if err != nil {
			return
		}
		n, err := io.Copy(w, r)
		if tel != nil && n > 0 {
			tel.Metrics().VNCBytes.Add(context.Background(), n,
				metric.WithAttributes(attribute.String("direction", direction)),
			)
		}
		if err != nil {
			return
		}
		if err := w.Close(); err != nil {
			return
		}
	}
}
