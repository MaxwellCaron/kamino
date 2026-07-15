package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
)

func TestRunCloneWithOperationSlotAdmissionFailureSkipsClone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/items/clone", nil)

	var called bool
	acquire := func(ctx context.Context) (func(), error) {
		return nil, context.Canceled
	}

	ok := runCloneWithOperationSlot(c, acquire, func() bool {
		called = true
		return true
	})
	if ok {
		t.Fatal("expected false return on admission failure")
	}
	if called {
		t.Fatal("clone callback should not run when admission fails")
	}
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != "VM operations are busy" {
		t.Fatalf("error = %q, want sanitized busy message", body["error"])
	}
}

func TestRunCloneWithOperationSlotReleasesAfterCallbackFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/items/clone", nil)

	executor := vmactions.NewExecutor(
		nil,
		nil,
		nil,
		vmactions.OperationConfig{Concurrency: 1},
		vmactions.PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)

	ok := runCloneWithOperationSlot(c, executor.AcquireOperationSlot, func() bool {
		return false
	})
	if ok {
		t.Fatal("expected false callback result")
	}

	acquireCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	release, err := executor.AcquireOperationSlot(acquireCtx)
	if err != nil {
		t.Fatalf("slot was not released after callback failure: %v", err)
	}
	release()
}
