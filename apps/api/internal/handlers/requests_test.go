package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func setupTestRouter(handler *RequestsHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	r.GET("/api/v1/requests", handler.List)
	r.GET("/api/v1/requests/mine", handler.ListMine)
	return r
}

func TestListCompletedInvalidRows(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests?scope=completed&rows=abc", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListCompletedInvalidPage(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests?scope=completed&page=0", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListMineHistoryInvalidRows(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests/mine?scope=history&rows=15", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListMineHistoryInvalidPage(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests/mine?scope=history&page=-1", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
