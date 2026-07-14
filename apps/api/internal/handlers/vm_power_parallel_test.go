package handlers

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunBoundedPowerActionsRespectsLimit(t *testing.T) {
	var active atomic.Int32
	var maxSeen atomic.Int32
	block := make(chan struct{})
	go func() {
		time.Sleep(50 * time.Millisecond)
		close(block)
	}()

	targets := make([]int, 6)
	results := runBoundedPowerActions(context.Background(), 2, targets, func(ctx context.Context, index int, target int) error {
		current := active.Add(1)
		for {
			seen := maxSeen.Load()
			if current <= seen || maxSeen.CompareAndSwap(seen, current) {
				break
			}
		}
		<-block
		active.Add(-1)
		return nil
	})

	if len(results) != len(targets) {
		t.Fatalf("results len = %d, want %d", len(results), len(targets))
	}
	if maxSeen.Load() != 2 {
		t.Fatalf("max overlap = %d, want 2", maxSeen.Load())
	}
}

func TestRunBoundedPowerActionsAttemptsAllTargetsAfterError(t *testing.T) {
	attempted := make([]bool, 4)
	results := runBoundedPowerActions(context.Background(), 4, attempted, func(ctx context.Context, index int, _ bool) error {
		attempted[index] = true
		if index == 1 {
			return errors.New("boom")
		}
		return nil
	})

	for i, ok := range attempted {
		if !ok {
			t.Fatalf("target %d was not attempted", i)
		}
	}
	if results[1].Err == nil {
		t.Fatal("expected error for index 1")
	}
	if results[0].Err != nil || results[2].Err != nil || results[3].Err != nil {
		t.Fatalf("unexpected errors: %+v", results)
	}
}

func TestRunBoundedPowerActionsPreservesInputOrder(t *testing.T) {
	type item struct {
		ID int
	}
	targets := []item{{1}, {2}, {3}}
	finishOrder := make([]int, 0, 3)
	var mu sync.Mutex

	results := runBoundedPowerActions(context.Background(), 3, targets, func(ctx context.Context, index int, target item) error {
		time.Sleep(time.Duration(3-index) * 10 * time.Millisecond)
		mu.Lock()
		finishOrder = append(finishOrder, index)
		mu.Unlock()
		return nil
	})

	for i, result := range results {
		if result.Index != i {
			t.Fatalf("result[%d].Index = %d", i, result.Index)
		}
	}
	if len(finishOrder) != 3 {
		t.Fatalf("finish order = %v", finishOrder)
	}
}

func TestRunBoundedPowerActionsHonorsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	results := runBoundedPowerActions(ctx, 2, []int{1, 2, 3}, func(ctx context.Context, index int, target int) error {
		return ctx.Err()
	})

	for _, result := range results {
		if !errors.Is(result.Err, context.Canceled) {
			t.Fatalf("result error = %v, want context.Canceled", result.Err)
		}
	}
}
