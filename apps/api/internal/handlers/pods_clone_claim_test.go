package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestAcquirePodCloneClaimReturnsConflictWhenAlreadyClaimed(t *testing.T) {
	claims := &fakePodCloneClaimStore{err: vmactions.ErrActionInProgress}
	handler := &PodsHandler{PodCloneClaims: claims}

	podID := uuid.New()
	userID := uuid.New()
	actorID := uuid.New()

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)

	if handler.acquirePodCloneClaim(c, podID, userID, "clone", actorID) {
		t.Fatal("expected claim conflict")
	}
	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d (body=%s)", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "another operation is already in progress for this pod") {
		t.Fatalf("expected conflict message, got %s", w.Body.String())
	}
}

type fakePodCloneClaimStore struct {
	err error
}

func (f *fakePodCloneClaimStore) Claim(context.Context, uuid.UUID, uuid.UUID, string, uuid.UUID) error {
	return f.err
}

func (*fakePodCloneClaimStore) Release(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
