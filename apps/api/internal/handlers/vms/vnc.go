package vms

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/vmaccess"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	vncCloseWriteDeadline  = 2 * time.Second
	vncWebSocketBufferSize = 64 * 1024
)

type VNCHandler struct {
	PX       *proxmox.Client
	Authz    vmAuthz
	Sessions httpx.LiveSessionValidator
	sessions *sessionStore
	upgrader websocket.Upgrader
}

func NewVNCHandler(px *proxmox.Client, frontendURL string) *VNCHandler {
	allowedOrigin := middleware.NormalizeOrigin(frontendURL)
	return &VNCHandler{
		PX:       px,
		sessions: newSessionStore(),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  vncWebSocketBufferSize,
			WriteBufferSize: vncWebSocketBufferSize,
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

func newSessionStore() *sessionStore {
	s := &sessionStore{sessions: make(map[string]*vncSession)}
	go s.reapLoop()
	return s
}

func denyVNCConnection(conn *websocket.Conn) {
	conn.WriteMessage(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid or expired session"))
}

// bridgeBidirectional bridges both directions until a copy loop, watchdog rejection, or ctx cancellation ends it.
func bridgeBidirectional(
	ctx context.Context,
	left, right *websocket.Conn,
	watchdogRejected <-chan struct{},
	shutdown func(),
) {
	copyDone := make(chan struct{}, 2)

	go func() {
		bridge(left, right)
		copyDone <- struct{}{}
	}()

	go func() {
		bridge(right, left)
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

func bridge(src, dst *websocket.Conn) {
	for {
		msgType, data, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(msgType, data); err != nil {
			return
		}
	}
}

func configureVNCTCPConn(conn *websocket.Conn) {
	if conn == nil {
		return
	}
	tcpConn, ok := conn.NetConn().(*net.TCPConn)
	if !ok {
		return
	}
	_ = tcpConn.SetNoDelay(true)
	_ = tcpConn.SetReadBuffer(vncWebSocketBufferSize)
	_ = tcpConn.SetWriteBuffer(vncWebSocketBufferSize)
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

func (s *sessionStore) reapLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
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

// PostProxy handles POST /api/v1/inventory/items/:id/vm/vnc/proxy.
// Calls the Proxmox vncproxy endpoint and returns a session ID + password.
func (h *VNCHandler) PostProxy(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	itemID, ok := httpx.ParseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := vmaccess.RequireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.ConsoleVM, false)
	if !ok {
		return
	}

	vncResp, err := h.PX.CreateVNCProxy(c.Request.Context(), target.GuestType, target.Node, target.VMID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to create VNC proxy", "create vnc proxy", err)
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

// WebSocket handles GET /api/v1/vnc/ws.
// The session ID is read from the ?sessionId query parameter.
func (h *VNCHandler) WebSocket(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	sessionID, ok := httpx.CurrentSessionID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if h.Sessions == nil || h.Authz == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vnc unavailable"})
		return
	}

	clientConn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer clientConn.Close()
	configureVNCTCPConn(clientConn)

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
		log.Printf("vnc session validation failed: %v", err)
		denyVNCConnection(clientConn)
		return
	}

	if err := h.Authz.Require(httpx.FreshAuthzContext(c.Request.Context()), principalID, sess.itemID, authorization.ConsoleVM); err != nil {
		log.Printf("vnc console authorization failed: %v", err)
		denyVNCConnection(clientConn)
		return
	}

	pxURL, err := url.Parse(h.PX.BaseURL())
	if err != nil {
		log.Printf("bad proxmox base url: %v", err)
		return
	}
	scheme := "wss"
	if pxURL.Scheme == "http" {
		scheme = "ws"
	}
	wsURL := fmt.Sprintf("%s://%s/api2/json/nodes/%s/%s/%d/vncwebsocket?port=%s&vncticket=%s",
		scheme, pxURL.Host, sess.node, sess.guestType, sess.vmid, sess.port, url.QueryEscape(sess.ticket))

	dialer := websocket.Dialer{
		ReadBufferSize:  vncWebSocketBufferSize,
		WriteBufferSize: vncWebSocketBufferSize,
	}
	if h.PX.Insecure() {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	pxHeaders := http.Header{}
	pxHeaders.Set("Authorization", h.PX.AuthHeader())

	pxConn, _, err := dialer.DialContext(c.Request.Context(), wsURL, pxHeaders)
	if err != nil {
		log.Printf("proxmox ws dial error: %v", err)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to connect to VNC"))
		return
	}
	defer pxConn.Close()
	configureVNCTCPConn(pxConn)

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
		ticker := time.NewTicker(httpx.LiveCheckInterval)
		defer ticker.Stop()
		if err := h.watchAuthorization(watchCtx, sessionID, principalID, sess.itemID, ticker.C); err != nil {
			log.Printf("vnc watchdog authorization failed: %v", err)
			close(watchdogRejected)
		}
	}()

	bridgeBidirectional(watchCtx, clientConn, pxConn, watchdogRejected, shutdown)
	<-watchdogStopped
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
			if err := h.Authz.Require(httpx.FreshAuthzContext(ctx), principalID, itemID, authorization.ConsoleVM); err != nil {
				return err
			}
		}
	}
}
