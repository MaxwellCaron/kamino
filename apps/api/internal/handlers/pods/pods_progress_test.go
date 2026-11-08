package pods

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/google/uuid"
)

func TestPodProgressStoresAreScopedToHandlerAndWorkflow(t *testing.T) {
	first, second := &PodsHandler{}, &PodsHandler{}
	first.Progress.CloneReporter("operation", "").Set(2, "cloning")
	principal := uuid.New()
	for _, tt := range []struct {
		handler *PodsHandler
		want    int
	}{{first, http.StatusOK}, {second, http.StatusNotFound}} {
		router := handlertest.NewEngine(http.MethodGet, "/progress/:id", principal, tt.handler.GetCloneProgress)
		response := handlertest.DoJSONRequest(router, http.MethodGet, "/progress/operation", "")
		handlertest.AssertStatus(t, response, tt.want)
	}
	if _, ok := first.Progress.GetPublish("operation"); ok {
		t.Fatal("clone progress leaked into publish progress")
	}
}
