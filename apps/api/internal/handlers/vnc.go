package handlers

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// VNCHandler handles VNC proxy and WebSocket bridge requests.
type VNCHandler struct {
	PX       *proxmox.Client
	sessions *sessionStore
}

// NewVNCHandler creates a VNCHandler with an initialized session store.
func NewVNCHandler(px *proxmox.Client) *VNCHandler {
	return &VNCHandler{
		PX:       px,
		sessions: newSessionStore(),
	}
}

// --- session store ---

type vncSession struct {
	node     string
	vmid     int
	port     string
	ticket   string
	password string
	expires  time.Time
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

type proxyRequest struct {
	Node string `json:"node" binding:"required"`
	VMID int    `json:"vmid" binding:"required"`
}

// PostProxy handles POST /api/v1/vnc/proxy.
// Calls the Proxmox vncproxy endpoint and returns a session ID + password.
func (h *VNCHandler) PostProxy(c *gin.Context) {
	var req proxyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	vncResp, err := h.PX.CreateVNCProxy(c.Request.Context(), req.Node, req.VMID)
	if err != nil {
		log.Printf("vnc proxy error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create VNC proxy"})
		return
	}

	sessionID := h.sessions.store(&vncSession{
		node:     req.Node,
		vmid:     req.VMID,
		port:     vncResp.Port,
		ticket:   vncResp.Ticket,
		password: vncResp.Password,
	})

	c.JSON(http.StatusOK, gin.H{
		"sessionId": sessionID,
		"password":  vncResp.Password,
	})
}

// --- WebSocket bridge ---

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type wsInitMessage struct {
	SessionID string `json:"sessionId"`
}

// WebSocket handles GET /api/v1/vnc/ws.
// The client sends a JSON init message with sessionId, then binary VNC frames are bridged.
func (h *VNCHandler) WebSocket(c *gin.Context) {
	clientConn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer clientConn.Close()

	// Read init message with session ID
	_, msg, err := clientConn.ReadMessage()
	if err != nil {
		log.Printf("ws read init error: %v", err)
		return
	}

	var init wsInitMessage
	if err := json.Unmarshal(msg, &init); err != nil {
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInvalidFramePayloadData, "invalid init message"))
		return
	}

	sess, ok := h.sessions.consume(init.SessionID)
	if !ok {
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
