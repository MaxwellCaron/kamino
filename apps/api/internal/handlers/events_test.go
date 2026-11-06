package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type fakeEventsAuthz struct {
	mu             sync.Mutex
	isManager      bool
	filterStatuses map[int]string
	filterErr      error
}

func (f *fakeEventsAuthz) IsManager(_ context.Context, _ uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.isManager, nil
}

func (f *fakeEventsAuthz) FilterVisibleStatuses(ctx context.Context, _ uuid.UUID, statuses map[int]string) (map[int]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
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

type eventPrincipalDB struct {
	database.DBTX
	principalIDs []uuid.UUID
}

func (db *eventPrincipalDB) Begin(context.Context) (pgx.Tx, error) {
	return nil, errors.New("unexpected transaction")
}

func (db *eventPrincipalDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &eventPrincipalRows{ids: db.principalIDs}, nil
}

type eventPrincipalRows struct {
	pgx.Rows
	ids   []uuid.UUID
	index int
}

func (rows *eventPrincipalRows) Next() bool { rows.index++; return rows.index <= len(rows.ids) }
func (rows *eventPrincipalRows) Close()     {}
func (rows *eventPrincipalRows) Err() error { return nil }
func (rows *eventPrincipalRows) Scan(dest ...any) error {
	*dest[0].(*uuid.UUID) = rows.ids[rows.index-1]
	return nil
}

func TestFilterVMStatusesRevokedAdministratorLosesVisibility(t *testing.T) {
	principalID, administratorGroupID := uuid.New(), uuid.New()
	db := &eventPrincipalDB{principalIDs: []uuid.UUID{administratorGroupID}}
	h := &EventsHandler{Authz: authorization.NewService(db, []uuid.UUID{administratorGroupID})}
	ctx := authorization.WithPrincipalCache(context.Background())
	statuses := map[int]string{1: "running"}

	visible, err := h.filterVMStatuses(ctx, principalID, statuses)
	if err != nil || visible[1] != "running" {
		t.Fatalf("administrator statuses = %v, %v", visible, err)
	}
	db.principalIDs = nil
	visible, err = h.filterVMStatuses(ctx, principalID, statuses)
	if err != nil {
		t.Fatal(err)
	}
	if len(visible) != 0 {
		t.Fatalf("revoked administrator still receives statuses: %v", visible)
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
