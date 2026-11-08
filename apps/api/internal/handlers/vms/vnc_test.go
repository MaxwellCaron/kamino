package vms

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/google/uuid"
)

var _ httpx.LiveSessionValidator = (*handlertest.FakeLiveSessionValidator)(nil)

func TestWatchAuthorization_StaysAliveUntilCancellation(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := &VNCHandler{Authz: &fakeVMAuthz{}, Sessions: &handlertest.FakeLiveSessionValidator{}}
		ctx, cancel := context.WithCancel(context.Background())
		tick := make(chan time.Time)
		done := make(chan error, 1)
		go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

		for i := 0; i < 3; i++ {
			tick <- time.Now()
		}

		synctest.Wait()
		select {
		case err := <-done:
			t.Fatalf("watchAuthorization returned early: %v", err)
		default:
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
	})
}

func TestWatchAuthorization_RevokedFamilyTriggersShutdown(t *testing.T) {
	h := &VNCHandler{
		Authz:    &fakeVMAuthz{},
		Sessions: &handlertest.FakeLiveSessionValidator{Err: errors.New("invalid session")},
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
		Sessions: &handlertest.FakeLiveSessionValidator{},
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
		Sessions: &handlertest.FakeLiveSessionValidator{Err: errors.New("database unavailable")},
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
	synctest.Test(t, func(t *testing.T) {
		h := &VNCHandler{Authz: &fakeVMAuthz{}, Sessions: &handlertest.FakeLiveSessionValidator{}}
		ctx, cancel := context.WithCancel(context.Background())
		tick := make(chan time.Time) // never ticks
		done := make(chan error, 1)
		go func() { done <- h.watchAuthorization(ctx, uuid.New(), uuid.New(), uuid.New(), tick) }()

		synctest.Wait()
		cancel()

		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("expected nil error on cancellation, got %v", err)
			}
		case <-time.After(time.Second):
			t.Fatal("watchAuthorization did not stop after cancellation")
		}
	})
}
