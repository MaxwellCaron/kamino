package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func newTestEngine(maxAttempts int, window time.Duration, trustedProxies []string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		panic(err)
	}
	r.POST("/login", LoginRateLimit(maxAttempts, window), func(c *gin.Context) {
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
