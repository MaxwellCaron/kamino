package handlers

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// VNCHandler handles VNC proxy and WebSocket bridge requests.
type VNCHandler struct {
	PX       *proxmox.Client
	Authz    *authorization.Service
	sessions *sessionStore
	upgrader websocket.Upgrader
}

// NewVNCHandler creates a VNCHandler with an initialized session store.
func NewVNCHandler(px *proxmox.Client, frontendURL string) *VNCHandler {
	allowedOrigin := middleware.NormalizeOrigin(frontendURL)
	return &VNCHandler{
		PX:       px,
		sessions: newSessionStore(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := strings.TrimSpace(r.Header.Get("Origin"))
				if origin == "" {
					return true
				}
				return allowedOrigin != "" && middleware.NormalizeOrigin(origin) == allowedOrigin
			},
		},
	}
}

// --- session store ---

type vncSession struct {
	node        string
	vmid        int
	port        string
	ticket      string
	password    string
	expires     time.Time
	principalID uuid.UUID
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

// --- HTTP handlers ---

// PostProxy handles POST /api/v1/inventory/items/:id/vm/vnc/proxy.
// Calls the Proxmox vncproxy endpoint and returns a session ID + password.
func (h *VNCHandler) PostProxy(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

	vncResp, err := h.PX.CreateVNCProxy(c.Request.Context(), target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create VNC proxy", "create vnc proxy", err)
		return
	}

	sessionID := h.sessions.store(&vncSession{
		node:        target.Node,
		vmid:        target.VMID,
		port:        vncResp.Port,
		ticket:      vncResp.Ticket,
		password:    vncResp.Password,
		principalID: principalID,
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	clientConn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer clientConn.Close()

	sess, ok := h.sessions.consume(c.Query("sessionId"))
	if !ok {
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid or expired session"))
		return
	}

	if sess.principalID != principalID {
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid or expired session"))
		return
	}

	// Build Proxmox WebSocket URL
	pxURL, err := url.Parse(h.PX.BaseURL())
	if err != nil {
		log.Printf("bad proxmox base url: %v", err)
		return
	}
	scheme := "wss"
	if pxURL.Scheme == "http" {
		scheme = "ws"
	}
	wsURL := fmt.Sprintf("%s://%s/api2/json/nodes/%s/qemu/%d/vncwebsocket?port=%s&vncticket=%s",
		scheme, pxURL.Host, sess.node, sess.vmid, sess.port, url.QueryEscape(sess.ticket))

	// Dial Proxmox WebSocket
	dialer := websocket.Dialer{}
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

	// Bridge binary frames bidirectionally
	done := make(chan struct{})

	go func() {
		defer close(done)
		bridge(pxConn, clientConn)
	}()

	bridge(clientConn, pxConn)
	<-done
}

func bridge(src, dst *websocket.Conn) {
	for {
		msgType, r, err := src.NextReader()
		if err != nil {
			return
		}
		w, err := dst.NextWriter(msgType)
		if err != nil {
			return
		}
		if _, err := io.Copy(w, r); err != nil {
			return
		}
		if err := w.Close(); err != nil {
			return
		}
	}
}
