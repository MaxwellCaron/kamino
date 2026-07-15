package vmactions

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestExecutorOperationConcurrency(t *testing.T) {
	executor := NewExecutor(nil, nil, nil, OperationConfig{Concurrency: 3}, PowerConfig{Concurrency: 1, TaskTimeout: time.Minute})
	if got := executor.OperationConcurrency(); got != 3 {
		t.Fatalf("OperationConcurrency() = %d, want 3", got)
	}
}

func TestExecutorOperationLimiterCapacityAndRelease(t *testing.T) {
	executor := NewExecutor(nil, nil, nil, OperationConfig{Concurrency: 2}, PowerConfig{Concurrency: 1, TaskTimeout: time.Minute})
	ctx := context.Background()

	release1, err := executor.AcquireOperationSlot(ctx)
	if err != nil {
		t.Fatalf("first AcquireOperationSlot() error = %v", err)
	}
	release2, err := executor.AcquireOperationSlot(ctx)
	if err != nil {
		t.Fatalf("second AcquireOperationSlot() error = %v", err)
	}

	acquiredThird := make(chan struct{}, 1)
	go func() {
		release, err := executor.AcquireOperationSlot(ctx)
		if err != nil {
			t.Errorf("third AcquireOperationSlot() error = %v", err)
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
	release1()
	select {
	case <-acquiredThird:
	case <-time.After(2 * time.Second):
		t.Fatal("third acquire should succeed after one slot is released")
	}
	release2()
}

func TestExecutorOperationLimiterCanceledAcquire(t *testing.T) {
	executor := NewExecutor(nil, nil, nil, OperationConfig{Concurrency: 1}, PowerConfig{Concurrency: 1, TaskTimeout: time.Minute})
	ctx := context.Background()

	release, err := executor.AcquireOperationSlot(ctx)
	if err != nil {
		t.Fatalf("AcquireOperationSlot() error = %v", err)
	}
	defer release()

	waitCtx, cancel := context.WithCancel(ctx)
	cancel()

	gotRelease, err := executor.AcquireOperationSlot(waitCtx)
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

func TestExecutorOperationLimiterReleaseAfterCallbackError(t *testing.T) {
	executor := NewExecutor(nil, nil, nil, OperationConfig{Concurrency: 1}, PowerConfig{Concurrency: 1, TaskTimeout: time.Minute})
	ctx := context.Background()

	runWithSlot := func() error {
		release, err := executor.AcquireOperationSlot(ctx)
		if err != nil {
			return err
		}
		defer release()
		return errors.New("operation failed")
	}

	if err := runWithSlot(); err == nil {
		t.Fatal("expected callback error")
	}

	release, err := executor.AcquireOperationSlot(ctx)
	if err != nil {
		t.Fatalf("slot was not released after callback error: %v", err)
	}
	release()
}
