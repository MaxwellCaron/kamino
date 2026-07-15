package handlers

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunBoundedActionsRespectsLimit(t *testing.T) {
	var active atomic.Int32
	var maxSeen atomic.Int32
	started := make(chan int, 6)
	release := make(chan struct{})

	done := make(chan []boundedActionResult, 1)

	targets := make([]int, 6)
	go func() {
		done <- runBoundedActions(context.Background(), 2, targets, func(ctx context.Context, index int, target int) error {
			current := active.Add(1)
			for {
				seen := maxSeen.Load()
				if current <= seen || maxSeen.CompareAndSwap(seen, current) {
					break
				}
			}
			started <- index
			<-release
			active.Add(-1)
			return nil
		})
	}()

	waitForStarted := func(count int) {
		t.Helper()
		seen := make(map[int]struct{}, count)
		deadline := time.After(2 * time.Second)
		for len(seen) < count {
			select {
			case index := <-started:
				seen[index] = struct{}{}
			case <-deadline:
				t.Fatalf("timed out waiting for %d started callbacks, got %d", count, len(seen))
			}
		}
	}

	waitForStarted(2)
	if maxSeen.Load() != 2 {
		t.Fatalf("max overlap = %d, want 2", maxSeen.Load())
	}

	select {
	case index := <-started:
		t.Fatalf("third callback started before release: index %d", index)
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	waitForStarted(4)

	select {
	case results := <-done:
		if len(results) != len(targets) {
			t.Fatalf("results len = %d, want %d", len(results), len(targets))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runner completion")
	}
}

func TestRunBoundedActionsAttemptsAllTargetsAfterError(t *testing.T) {
	attempted := make([]bool, 4)
	results := runBoundedActions(context.Background(), 4, attempted, func(ctx context.Context, index int, _ bool) error {
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

func TestRunBoundedActionsPreservesInputOrder(t *testing.T) {
	type item struct {
		ID int
	}
	targets := []item{{1}, {2}, {3}}
	started := make(chan int, 3)
	release := []chan struct{}{
		make(chan struct{}),
		make(chan struct{}),
		make(chan struct{}),
	}
	finished := []chan struct{}{
		make(chan struct{}),
		make(chan struct{}),
		make(chan struct{}),
	}
	finishOrder := make([]int, 0, 3)
	var mu sync.Mutex

	go func() {
		results := runBoundedActions(context.Background(), 3, targets, func(ctx context.Context, index int, target item) error {
			started <- index
			<-release[index]
			mu.Lock()
			finishOrder = append(finishOrder, index)
			mu.Unlock()
			close(finished[index])
			return nil
		})
		for i, result := range results {
			if result.Index != i {
				t.Errorf("result[%d].Index = %d", i, result.Index)
			}
		}
	}()

	waitForAllStarted := func() {
		t.Helper()
		seen := make(map[int]struct{}, 3)
		deadline := time.After(2 * time.Second)
		for len(seen) < 3 {
			select {
			case index := <-started:
				seen[index] = struct{}{}
			case <-deadline:
				t.Fatalf("timed out waiting for all callbacks to start, got %d", len(seen))
			}
		}
	}

	waitForAllStarted()
	close(release[2])
	select {
	case <-finished[2]:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for index 2 to finish")
	}
	close(release[1])
	select {
	case <-finished[1]:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for index 1 to finish")
	}
	close(release[0])
	select {
	case <-finished[0]:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for index 0 to finish")
	}

	if len(finishOrder) != 3 {
		t.Fatalf("finish order = %v", finishOrder)
	}
	if finishOrder[0] != 2 || finishOrder[1] != 1 || finishOrder[2] != 0 {
		t.Fatalf("finish order = %v, want [2 1 0]", finishOrder)
	}
}

func TestRunBoundedActionsHonorsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	results := runBoundedActions(ctx, 2, []int{1, 2, 3}, func(ctx context.Context, index int, target int) error {
		return ctx.Err()
	})

	for _, result := range results {
		if !errors.Is(result.Err, context.Canceled) {
			t.Fatalf("result error = %v, want context.Canceled", result.Err)
		}
	}
}
