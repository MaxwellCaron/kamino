package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newCSRFTestEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequireCSRFHeader())
	r.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	r.POST("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	r.OPTIONS("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

func TestRequireCSRFHeader_GETWithoutHeader_Allows(t *testing.T) {
	r := newCSRFTestEngine()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRequireCSRFHeader_POSTWithoutHeader_Forbidden(t *testing.T) {
	r := newCSRFTestEngine()
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
	if body := w.Body.String(); body != `{"error":"missing required request header"}` {
		t.Fatalf("unexpected body: %s", body)
	}
}

func TestRequireCSRFHeader_POSTWithHeader_Allows(t *testing.T) {
	r := newCSRFTestEngine()
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	req.Header.Set("X-Kamino-Request", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRequireCSRFHeader_OPTIONSWithoutHeader_Allows(t *testing.T) {
	r := newCSRFTestEngine()
	req := httptest.NewRequest(http.MethodOptions, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
