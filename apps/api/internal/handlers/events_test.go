package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// fakeEventsAuthz is a minimal, configurable eventsAuthz implementation.
type fakeEventsAuthz struct {
	mu             sync.Mutex
	isManager      bool
	filterStatuses map[int]string
	filterErr      error
	filterCtxs     []context.Context
}

func (f *fakeEventsAuthz) IsManager(_ context.Context, _ uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.isManager, nil
}

func (f *fakeEventsAuthz) FilterVisibleStatuses(ctx context.Context, _ uuid.UUID, statuses map[int]string) (map[int]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.filterCtxs = append(f.filterCtxs, ctx)
	if f.filterErr != nil {
		return nil, f.filterErr
	}
	if f.filterStatuses != nil {
		return f.filterStatuses, nil
	}
	return statuses, nil
}

func (f *fakeEventsAuthz) setIsManager(v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.isManager = v
}

var _ eventsAuthz = (*fakeEventsAuthz)(nil)

// fakeEventsRequestService is a minimal, configurable eventsRequestService.
type fakeEventsRequestService struct {
	mu        sync.Mutex
	ensureErr error
}

func (f *fakeEventsRequestService) EnsureQueueAccess(_ context.Context, _ uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ensureErr
}

func (f *fakeEventsRequestService) Subscribe() (<-chan requestqueue.Event, func()) {
	ch := make(chan requestqueue.Event)
	return ch, func() {}
}

var _ eventsRequestService = (*fakeEventsRequestService)(nil)

func TestAuthorizeRequestEvent_OwnEventSendsWithoutReviewerAccess(t *testing.T) {
	principalID := uuid.New()
	requestID := uuid.New()
	h := &EventsHandler{Requests: &fakeEventsRequestService{ensureErr: requestqueue.ErrRequestForbidden}}

	event := requestqueue.Event{RequestID: &requestID, RequesterPrincipalID: &principalID}
	send, err := h.authorizeRequestEvent(context.Background(), principalID, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !send {
		t.Fatal("expected own request event to be sent without reviewer access")
	}
}

func TestAuthorizeRequestEvent_OtherUsersEventSkippedAfterReviewerPermissionRemoved(t *testing.T) {
	principalID := uuid.New()
	otherID := uuid.New()
	requestID := uuid.New()
	h := &EventsHandler{Requests: &fakeEventsRequestService{ensureErr: requestqueue.ErrRequestForbidden}}

	event := requestqueue.Event{RequestID: &requestID, RequesterPrincipalID: &otherID}
	send, err := h.authorizeRequestEvent(context.Background(), principalID, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if send {
		t.Fatal("expected another user's request event to be skipped once reviewer access is forbidden")
	}
}

func TestAuthorizeRequestEvent_UnexpectedErrorClosesStream(t *testing.T) {
	principalID := uuid.New()
	otherID := uuid.New()
	requestID := uuid.New()
	backendErr := errors.New("queue service unavailable")
	h := &EventsHandler{Requests: &fakeEventsRequestService{ensureErr: backendErr}}

	event := requestqueue.Event{RequestID: &requestID, RequesterPrincipalID: &otherID}
	send, err := h.authorizeRequestEvent(context.Background(), principalID, event)
	if send {
		t.Fatal("expected the event not to be sent on an unexpected authorization error")
	}
	if !errors.Is(err, backendErr) {
		t.Fatalf("expected the backend error to propagate, got %v", err)
	}
}

func TestAuthorizePublishProgressEvent_SkippedAfterManagerRemoved(t *testing.T) {
	principalID := uuid.New()
	authz := &fakeEventsAuthz{isManager: true}
	h := &EventsHandler{Authz: authz}

	send, err := h.authorizePublishProgressEvent(context.Background(), principalID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !send {
		t.Fatal("expected progress event to send while principal is a manager")
	}

	authz.setIsManager(false)

	send, err = h.authorizePublishProgressEvent(context.Background(), principalID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if send {
		t.Fatal("expected progress event to be skipped once Manager is removed")
	}
}

func TestFilterVMStatuses_UsesSeparatePrincipalCacheInstancesPerCall(t *testing.T) {
	principalID := uuid.New()
	authz := &fakeEventsAuthz{}
	h := &EventsHandler{Authz: authz}

	if _, err := h.filterVMStatuses(context.Background(), principalID, map[int]string{1: "running"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := h.filterVMStatuses(context.Background(), principalID, map[int]string{2: "stopped"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(authz.filterCtxs) != 2 {
		t.Fatalf("expected 2 recorded contexts, got %d", len(authz.filterCtxs))
	}
	if authz.filterCtxs[0] == authz.filterCtxs[1] {
		t.Fatal("expected filterVMStatuses to wrap each call in a fresh principal cache, not reuse one across events")
	}
}

func newTestStreamContext(t *testing.T) (*gin.Context, *httptest.ResponseRecorder, context.CancelFunc) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	ctx, cancel := context.WithCancel(context.Background())
	c.Request = httptest.NewRequest(http.MethodGet, "/events", nil).WithContext(ctx)
	return c, w, cancel
}

// syncFlusher signals on notify after Flush so tests can safely read the recorder without racing the writer.
type syncFlusher struct {
	http.Flusher
	notify chan struct{}
}

func (f *syncFlusher) Flush() {
	f.Flusher.Flush()
	f.notify <- struct{}{}
}

func TestStreamLoop_HeartbeatClosesStreamAfterSessionInvalidated(t *testing.T) {
	c, w, cancel := newTestStreamContext(t)
	defer cancel()

	validator := &fakeLiveSessionValidator{}
	h := &EventsHandler{Sessions: validator}

	principalID := uuid.New()
	sessionID := uuid.New()
	tick := make(chan time.Time)
	flushed := make(chan struct{})
	flusher := &syncFlusher{Flusher: w, notify: flushed}

	loopDone := make(chan struct{})
	go func() {
		h.streamLoop(c, principalID, sessionID, flusher, nil, nil, nil, nil, tick)
		close(loopDone)
	}()

	tick <- time.Now()
	<-flushed
	writtenBeforeInvalidation := w.Body.Len()
	if writtenBeforeInvalidation == 0 {
		t.Fatal("expected a heartbeat to be written while the session is valid")
	}

	validator.setErr(errors.New("invalid session"))
	tick <- time.Now()

	select {
	case <-loopDone:
	case <-time.After(time.Second):
		t.Fatal("streamLoop did not exit after the session became invalid")
	}

	if w.Body.Len() != writtenBeforeInvalidation {
		t.Fatal("expected no further writes to the stream after invalidation")
	}
}
