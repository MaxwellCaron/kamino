package handlers

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
)

func TestRunBoundedVMDeletesRespectsOperationLimit(t *testing.T) {
	var active atomic.Int32
	var maxSeen atomic.Int32
	started := make(chan struct{}, 4)
	release := make(chan struct{})

	targets := make([]verifiedVMTarget, 4)
	for i := range targets {
		targets[i] = verifiedVMTarget{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU}
	}

	acquireFn := func(ctx context.Context) (func(), error) {
		current := active.Add(1)
		for {
			seen := maxSeen.Load()
			if current <= seen || maxSeen.CompareAndSwap(seen, current) {
				break
			}
		}
		started <- struct{}{}
		<-release
		active.Add(-1)
		return func() {}, nil
	}

	done := make(chan []boundedVMDeleteOutcome, 1)
	go func() {
		done <- runBoundedVMDeletes(context.Background(), 2, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, error) {
			return true, nil
		})
	}()

	waitStarted := func(count int) {
		t.Helper()
		for i := 0; i < count; i++ {
			select {
			case <-started:
			case <-time.After(2 * time.Second):
				t.Fatalf("timed out waiting for %d started workers", count)
			}
		}
	}

	waitStarted(2)
	if maxSeen.Load() != 2 {
		t.Fatalf("max overlap = %d, want 2", maxSeen.Load())
	}

	select {
	case <-started:
		t.Fatal("third worker started before release")
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	waitStarted(2)
	select {
	case outcomes := <-done:
		if len(outcomes) != len(targets) {
			t.Fatalf("outcomes len = %d, want %d", len(outcomes), len(targets))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runner completion")
	}
}

func TestRunBoundedVMDeletesAttemptsAllTargetsAfterFailure(t *testing.T) {
	var attempted sync.Map
	errBoom := errors.New("boom")
	targets := []verifiedVMTarget{
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
	}

	outcomes := runBoundedVMDeletes(context.Background(), 2, targets, func(ctx context.Context) (func(), error) {
		return func() {}, nil
	}, func(ctx context.Context, target verifiedVMTarget) (bool, error) {
		attempted.Store(target.ItemID, true)
		if target.ItemID == targets[1].ItemID {
			return true, errBoom
		}
		return true, nil
	})

	for _, target := range targets {
		if _, ok := attempted.Load(target.ItemID); !ok {
			t.Fatalf("target %s was not attempted", target.ItemID)
		}
	}
	if outcomes[1].err == nil {
		t.Fatal("expected error for index 1")
	}
}

func TestRunBoundedVMDeletesPreservesInputOrder(t *testing.T) {
	id1, id2, id3 := uuid.New(), uuid.New(), uuid.New()
	targets := []verifiedVMTarget{
		{ItemID: id1, GuestType: proxmox.GuestQEMU},
		{ItemID: id2, GuestType: proxmox.GuestQEMU},
		{ItemID: id3, GuestType: proxmox.GuestQEMU},
	}

	outcomes := runBoundedVMDeletes(context.Background(), 3, targets, func(ctx context.Context) (func(), error) {
		return func() {}, nil
	}, func(ctx context.Context, target verifiedVMTarget) (bool, error) {
		return true, nil
	})

	if outcomes[0].target.ItemID != id1 || outcomes[1].target.ItemID != id2 || outcomes[2].target.ItemID != id3 {
		t.Fatalf("outcome order changed: %+v", outcomes)
	}
}

func TestRunBoundedVMDeletesDoesNotClaimBeforeAdmission(t *testing.T) {
	hold := make(chan struct{})
	releaseHold := make(chan struct{})
	var deleteStarted atomic.Bool

	targets := []verifiedVMTarget{{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU}}

	acquireFn := func(ctx context.Context) (func(), error) {
		select {
		case hold <- struct{}{}:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out sending hold signal")
		}
		<-releaseHold
		return func() {}, nil
	}

	done := make(chan []boundedVMDeleteOutcome, 1)
	go func() {
		done <- runBoundedVMDeletes(context.Background(), 1, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, error) {
			deleteStarted.Store(true)
			return true, nil
		})
	}()

	select {
	case <-hold:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for acquire to block")
	}
	if deleteStarted.Load() {
		t.Fatal("delete started before admission release")
	}
	close(releaseHold)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for delete completion")
	}
}

func TestRunBoundedVMDeletesReleasesAfterDeleteError(t *testing.T) {
	var active atomic.Int32
	targets := []verifiedVMTarget{{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU}}

	acquireFn := func(ctx context.Context) (func(), error) {
		if active.Add(1) > 1 {
			return nil, errors.New("slot not released")
		}
		return func() { active.Add(-1) }, nil
	}

	outcomes := runBoundedVMDeletes(context.Background(), 1, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, error) {
		return true, errors.New("delete failed")
	})
	if outcomes[0].err == nil {
		t.Fatal("expected delete error")
	}

	_, err := acquireFn(context.Background())
	if err != nil {
		t.Fatalf("slot was not released after delete error: %v", err)
	}
}
