package handlers

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPodProvisionLimiterCapacityAndRelease(t *testing.T) {
	limiter := NewPodProvisionLimiter(2)
	ctx := context.Background()

	release1, err := limiter.Acquire(ctx)
	if err != nil {
		t.Fatalf("first Acquire() error = %v", err)
	}
	release2, err := limiter.Acquire(ctx)
	if err != nil {
		t.Fatalf("second Acquire() error = %v", err)
	}

	acquiredThird := make(chan struct{}, 1)
	go func() {
		release, err := limiter.Acquire(ctx)
		if err != nil {
			t.Errorf("third Acquire() error = %v", err)
			return
		}
		release()
		acquiredThird <- struct{}{}
	}()

	select {
	case <-acquiredThird:
		t.Fatal("third acquire should block while both slots are held")
	case <-time.After(100 * time.Millisecond):
	}

	release1()
	select {
	case <-acquiredThird:
	case <-time.After(2 * time.Second):
		t.Fatal("third acquire should succeed after one slot is released")
	}
	release2()
}

func TestPodProvisionLimiterCanceledAcquire(t *testing.T) {
	limiter := NewPodProvisionLimiter(1)
	ctx := context.Background()

	release, err := limiter.Acquire(ctx)
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}
	defer release()

	waitCtx, cancel := context.WithCancel(ctx)
	cancel()

	gotRelease, err := limiter.Acquire(waitCtx)
	if err == nil {
		if gotRelease != nil {
			gotRelease()
		}
		t.Fatal("expected canceled acquire to fail")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if gotRelease != nil {
		t.Fatal("expected nil release function on failed acquire")
	}
}

func TestPodProvisionLimiterReleaseOnCallbackError(t *testing.T) {
	limiter := NewPodProvisionLimiter(1)
	ctx := context.Background()

	runWithSlot := func() error {
		release, err := limiter.Acquire(ctx)
		if err != nil {
			return err
		}
		defer release()
		return errors.New("operation failed")
	}

	if err := runWithSlot(); err == nil {
		t.Fatal("expected callback error")
	}

	release, err := limiter.Acquire(ctx)
	if err != nil {
		t.Fatalf("slot was not released after callback error: %v", err)
	}
	release()
}
