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
