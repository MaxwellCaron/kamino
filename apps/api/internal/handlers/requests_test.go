package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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

func TestListCompletedInvalidLimit(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests?scope=completed&limit=abc", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListCompletedInvalidCursor(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests?scope=completed&cursor=not-valid-base64!!!", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListMineHistoryInvalidLimit(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests/mine?scope=history&limit=-1", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListMineHistoryInvalidCursor(t *testing.T) {
	handler := &RequestsHandler{
		Service: &requestqueue.Service{},
	}
	router := setupTestRouter(handler)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/requests/mine?scope=history&cursor=bad", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestCursorEncodingRoundTrip(t *testing.T) {
	cursor := requestqueue.RequestCursor{
		UpdatedAt: time.Now().Truncate(time.Microsecond),
		CreatedAt: time.Now().Add(-time.Hour).Truncate(time.Microsecond),
		ID:        uuid.New(),
	}

	encoded := requestqueue.EncodeCursor(cursor)
	if encoded == "" {
		t.Fatal("EncodeCursor returned empty string")
	}

	decoded, err := requestqueue.DecodeCursor(encoded)
	if err != nil {
		t.Fatalf("DecodeCursor() error = %v", err)
	}

	if decoded.ID != cursor.ID {
		t.Errorf("ID round-trip failed: got %v, want %v", decoded.ID, cursor.ID)
	}
}
