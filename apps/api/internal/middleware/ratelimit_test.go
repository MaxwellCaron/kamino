package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

const testLoginMessage = "too many login attempts, try again later"
const testRefreshMessage = "too many refresh attempts, try again later"

func newTestEngine(maxAttempts int, window time.Duration, trustedProxies []string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		panic(err)
	}
	r.POST("/login", IPRateLimit(maxAttempts, window, testLoginMessage), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

func doRequest(r *gin.Engine, remoteAddr, forwardedFor string) int {
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = remoteAddr
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestLoginRateLimit_AllowsUnderLimit(t *testing.T) {
	r := newTestEngine(10, time.Minute, nil)
	for i := 0; i < 10; i++ {
		code := doRequest(r, "1.2.3.4:1234", "")
		if code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, code)
		}
	}
}

func TestLoginRateLimit_BlocksOnExceed(t *testing.T) {
	r := newTestEngine(10, time.Minute, nil)
	for i := 0; i < 10; i++ {
		doRequest(r, "1.2.3.4:1234", "")
	}
	code := doRequest(r, "1.2.3.4:1234", "")
	if code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 11th request, got %d", code)
	}
}

func TestLoginRateLimit_IsolatesIPs(t *testing.T) {
	r := newTestEngine(10, time.Minute, nil)
	for i := 0; i < 11; i++ {
		doRequest(r, "1.2.3.4:1234", "")
	}
	code := doRequest(r, "5.6.7.8:5678", "")
	if code != http.StatusOK {
		t.Fatalf("different IP should not be throttled, got %d", code)
	}
}

func TestLoginRateLimit_ResetsAfterWindow(t *testing.T) {
	r := newTestEngine(2, 50*time.Millisecond, nil)
	for i := 0; i < 3; i++ {
		doRequest(r, "1.2.3.4:1234", "")
	}
	time.Sleep(60 * time.Millisecond)
	code := doRequest(r, "1.2.3.4:1234", "")
	if code != http.StatusOK {
		t.Fatalf("expected 200 after window reset, got %d", code)
	}
}

// Addresses below use RFC 5737 TEST-NET ranges (documentation-only).

func TestLoginRateLimit_TrustedProxy_IsolatesForwardedIPs(t *testing.T) {
	r := newTestEngine(10, time.Minute, []string{"203.0.113.10/32"})
	gatewayAddr := "203.0.113.10:5678"

	for i := 0; i < 11; i++ {
		doRequest(r, gatewayAddr, "198.51.100.7")
	}
	code := doRequest(r, gatewayAddr, "198.51.100.99")
	if code != http.StatusOK {
		t.Fatalf("different forwarded client behind the same trusted proxy should not be throttled, got %d", code)
	}
}

func TestLoginRateLimit_UntrustedPeer_ForwardedForIgnored(t *testing.T) {
	r := newTestEngine(10, time.Minute, []string{"203.0.113.10/32"})
	attackerAddr := "9.9.9.9:4444"

	for i := 0; i < 10; i++ {
		doRequest(r, attackerAddr, "198.51.100.1")
	}
	code := doRequest(r, attackerAddr, "198.51.100.2")
	if code != http.StatusTooManyRequests {
		t.Fatalf("forged X-Forwarded-For from an untrusted peer should not evade the limit, got %d", code)
	}
}

func TestLoginRateLimit_TrustedProxy_MultiHop_UsesNearestUntrustedHop(t *testing.T) {
	r := newTestEngine(10, time.Minute, []string{"203.0.113.10/32"})
	gatewayAddr := "203.0.113.10:5678"

	for i := 0; i < 11; i++ {
		doRequest(r, gatewayAddr, "198.51.100.7, 192.0.2.55")
	}
	code := doRequest(r, gatewayAddr, "198.51.100.200, 192.0.2.55")
	if code != http.StatusTooManyRequests {
		t.Fatalf("a different claimed client ahead of the same untrusted hop should still share its bucket, got %d", code)
	}
}

func TestIPRateLimit_UsesProvidedMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/refresh", IPRateLimit(1, time.Minute, testRefreshMessage), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/refresh", nil)
	req.RemoteAddr = "1.2.3.4:1234"
	r.ServeHTTP(httptest.NewRecorder(), req)

	req2 := httptest.NewRequest(http.MethodPost, "/refresh", nil)
	req2.RemoteAddr = "1.2.3.4:1234"
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w2.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w2.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	if body["error"] != testRefreshMessage {
		t.Fatalf("expected message %q, got %q", testRefreshMessage, body["error"])
	}
}

func TestIPRateLimit_SeparateRoutesDoNotShareLimiterState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/login", IPRateLimit(1, time.Minute, testLoginMessage), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	r.POST("/refresh", IPRateLimit(1, time.Minute, testRefreshMessage), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	loginReq := httptest.NewRequest(http.MethodPost, "/login", nil)
	loginReq.RemoteAddr = "1.2.3.4:1234"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, loginReq)
	if w.Code != http.StatusOK {
		t.Fatalf("expected first login request to succeed, got %d", w.Code)
	}

	refreshReq := httptest.NewRequest(http.MethodPost, "/refresh", nil)
	refreshReq.RemoteAddr = "1.2.3.4:1234"
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, refreshReq)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected the refresh limiter to have independent state from the login limiter, got %d", w2.Code)
	}
}
