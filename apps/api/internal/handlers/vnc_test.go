package handlers

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
)

// fakeLiveSessionValidator is a minimal, configurable liveSessionValidator.
type fakeLiveSessionValidator struct {
	mu  sync.Mutex
	err error
}

func (f *fakeLiveSessionValidator) ValidateLiveSession(_ context.Context, _, _ uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.err
}

func (f *fakeLiveSessionValidator) setErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.err = err
}

var _ liveSessionValidator = (*fakeLiveSessionValidator)(nil)

func TestWatchAuthorization_StaysAliveUntilCancellation(t *testing.T) {
	h := &VNCHandler{Authz: &fakeVMAuthz{}, Sessions: &fakeLiveSessionValidator{}}
	ctx, cancel := context.WithCancel(context.Background())
	tick := make(chan time.Time)
	done := make(chan error, 1)
	go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

	for i := 0; i < 3; i++ {
		tick <- time.Now()
	}

	select {
	case err := <-done:
		t.Fatalf("watchAuthorization returned early: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil error on cancellation, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("watchAuthorization did not stop after cancellation")
	}
}

func TestWatchAuthorization_RevokedFamilyTriggersShutdown(t *testing.T) {
	h := &VNCHandler{
		Authz:    &fakeVMAuthz{},
		Sessions: &fakeLiveSessionValidator{err: errors.New("invalid session")},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := make(chan time.Time, 1)
	done := make(chan error, 1)
	go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

	tick <- time.Now()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected non-nil error when the session family is revoked")
		}
	case <-time.After(time.Second):
		t.Fatal("watchAuthorization did not stop after family revocation")
	}
}

func TestWatchAuthorization_RemovedConsoleVMTriggersShutdown(t *testing.T) {
	h := &VNCHandler{
		Authz:    &fakeVMAuthz{requireErr: authorization.ErrForbidden},
		Sessions: &fakeLiveSessionValidator{},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := make(chan time.Time, 1)
	done := make(chan error, 1)
	go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

	tick <- time.Now()

	select {
	case err := <-done:
		if !errors.Is(err, authorization.ErrForbidden) {
			t.Fatalf("expected ErrForbidden when ConsoleVM is removed, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("watchAuthorization did not stop after ConsoleVM removal")
	}
}

func TestWatchAuthorization_BackendErrorFailsClosed(t *testing.T) {
	h := &VNCHandler{
		Authz:    &fakeVMAuthz{},
		Sessions: &fakeLiveSessionValidator{err: errors.New("database unavailable")},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := make(chan time.Time, 1)
	done := make(chan error, 1)
	go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

	tick <- time.Now()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected a backend error to fail closed rather than keep the watcher alive")
		}
	case <-time.After(time.Second):
		t.Fatal("watchAuthorization did not stop after a backend error")
	}
}

func TestWatchAuthorization_CancellationStopsPromptly(t *testing.T) {
	h := &VNCHandler{Authz: &fakeVMAuthz{}, Sessions: &fakeLiveSessionValidator{}}
	ctx, cancel := context.WithCancel(context.Background())
	tick := make(chan time.Time) // never ticks
	done := make(chan error, 1)
	go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

	start := time.Now()
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("expected nil error on cancellation, got %v", err)
		}
		if elapsed := time.Since(start); elapsed > 200*time.Millisecond {
			t.Fatalf("watchAuthorization took too long to stop after cancellation: %v", elapsed)
		}
	case <-time.After(time.Second):
		t.Fatal("watchAuthorization did not stop after cancellation")
	}
}
