package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func newTestEngine(maxAttempts int, window time.Duration) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/login", LoginRateLimit(maxAttempts, window), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

func doRequest(r *gin.Engine, remoteAddr string) int {
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestLoginRateLimit_AllowsUnderLimit(t *testing.T) {
	r := newTestEngine(10, time.Minute)
	for i := 0; i < 10; i++ {
		code := doRequest(r, "1.2.3.4:1234")
		if code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, code)
		}
	}
}

func TestLoginRateLimit_BlocksOnExceed(t *testing.T) {
	r := newTestEngine(10, time.Minute)
	for i := 0; i < 10; i++ {
		doRequest(r, "1.2.3.4:1234")
	}
	code := doRequest(r, "1.2.3.4:1234")
	if code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 11th request, got %d", code)
	}
}

func TestLoginRateLimit_IsolatesIPs(t *testing.T) {
	r := newTestEngine(10, time.Minute)
	for i := 0; i < 11; i++ {
		doRequest(r, "1.2.3.4:1234")
	}
	code := doRequest(r, "5.6.7.8:5678")
	if code != http.StatusOK {
		t.Fatalf("different IP should not be throttled, got %d", code)
	}
}

func TestLoginRateLimit_ResetsAfterWindow(t *testing.T) {
	r := newTestEngine(2, 50*time.Millisecond)
	for i := 0; i < 3; i++ {
		doRequest(r, "1.2.3.4:1234")
	}
	time.Sleep(60 * time.Millisecond)
	code := doRequest(r, "1.2.3.4:1234")
	if code != http.StatusOK {
		t.Fatalf("expected 200 after window reset, got %d", code)
	}
}
