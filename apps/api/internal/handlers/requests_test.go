package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
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

func TestApproveRequestActionInProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &RequestsHandler{}
	reviewerID := uuid.New()
	requestID := uuid.New()

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/requests/approve", nil)

	handler.writeRequestActionResponse(c, reviewerID, []string{requestID.String()}, func(
		context.Context,
		uuid.UUID,
		uuid.UUID,
	) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error) {
		return database.GetRequestByIDRow{}, nil, requestqueue.ErrRequestActionInProgress
	})

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body=%s)", w.Code, w.Body.String())
	}

	var response requestActionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Processed) != 0 {
		t.Fatalf("processed = %v, want none", response.Processed)
	}
	if len(response.Failed) != 1 {
		t.Fatalf("failed count = %d, want 1", len(response.Failed))
	}
	if response.Failed[0].ID != requestID.String() {
		t.Fatalf("failed id = %q, want %q", response.Failed[0].ID, requestID.String())
	}
	if response.Failed[0].Error != "another action is already in progress for this VM" {
		t.Fatalf("failed error = %q, want VM conflict message", response.Failed[0].Error)
	}
}
