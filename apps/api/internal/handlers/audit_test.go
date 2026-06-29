package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func setupAuditTestRouter(handler *AuditHandler, withUser bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if withUser {
		r.Use(func(c *gin.Context) {
			c.Set("userID", uuid.New())
			c.Next()
		})
	}
	r.GET("/api/v1/admin/audit/actions", handler.List)
	return r
}

func TestAuditListRequiresAuth(t *testing.T) {
	handler := &AuditHandler{
		Audit: &audit.Service{},
	}
	router := setupAuditTestRouter(handler, false)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/admin/audit/actions", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuditListRequiresUser(t *testing.T) {
	handler := &AuditHandler{
		Audit: &audit.Service{},
	}
	router := setupAuditTestRouter(handler, false)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/admin/audit/actions", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when no user context, got %d", w.Code)
	}
}

func TestParsePageParam(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   int32
		wantOk bool
	}{
		{"empty defaults to 1", "", 1, true},
		{"valid page", "3", 3, true},
		{"page one", "1", 1, true},
		{"zero rejected", "0", 0, false},
		{"negative rejected", "-1", 0, false},
		{"non-numeric rejected", "abc", 0, false},
		{"float rejected", "1.5", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parsePageParam(tt.input)
			if ok != tt.wantOk {
				t.Fatalf("parsePageParam(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			}
			if ok && got != tt.want {
				t.Errorf("parsePageParam(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseRowsParam(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   int32
		wantOk bool
	}{
		{"empty defaults to 25", "", 25, true},
		{"allowed value 10", "10", 10, true},
		{"allowed value 20", "20", 20, true},
		{"allowed value 25", "25", 25, true},
		{"allowed value 30", "30", 30, true},
		{"allowed value 40", "40", 40, true},
		{"allowed value 50", "50", 50, true},
		{"disallowed value rejected", "15", 0, false},
		{"zero rejected", "0", 0, false},
		{"negative rejected", "-25", 0, false},
		{"non-numeric rejected", "abc", 0, false},
		{"over max disallowed", "100", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parseRowsParam(tt.input)
			if ok != tt.wantOk {
				t.Fatalf("parseRowsParam(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			}
			if ok && got != tt.want {
				t.Errorf("parseRowsParam(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
