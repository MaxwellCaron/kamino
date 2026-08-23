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

func TestRunBoundedVMTemplateConversionsRespectsOperationLimit(t *testing.T) {
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

	done := make(chan []boundedVMTemplateOutcome, 1)
	go func() {
		done <- runBoundedVMTemplateConversions(context.Background(), 2, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
			return true, false, nil
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

func TestRunBoundedVMTemplateConversionsAttemptsAllTargetsAfterFailure(t *testing.T) {
	var attempted sync.Map
	errBoom := errors.New("boom")
	targets := []verifiedVMTarget{
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
		{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU},
	}

	outcomes := runBoundedVMTemplateConversions(context.Background(), 2, targets, func(ctx context.Context) (func(), error) {
		return func() {}, nil
	}, func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
		attempted.Store(target.ItemID, true)
		if target.ItemID == targets[1].ItemID {
			return true, false, errBoom
		}
		return true, false, nil
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

func TestRunBoundedVMTemplateConversionsPreservesOrderAndSkipsLXC(t *testing.T) {
	qemu1 := uuid.New()
	lxc := uuid.New()
	qemu2 := uuid.New()
	targets := []verifiedVMTarget{
		{ItemID: qemu1, GuestType: proxmox.GuestQEMU},
		{ItemID: lxc, GuestType: proxmox.GuestLXC},
		{ItemID: qemu2, GuestType: proxmox.GuestQEMU},
	}

	var acquireCount atomic.Int32
	var convertCount atomic.Int32

	outcomes := runBoundedVMTemplateConversions(context.Background(), 2, targets, func(ctx context.Context) (func(), error) {
		acquireCount.Add(1)
		return func() {}, nil
	}, func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
		convertCount.Add(1)
		return true, false, nil
	})

	if len(outcomes) != 3 {
		t.Fatalf("outcomes len = %d, want 3", len(outcomes))
	}
	if outcomes[0].target.ItemID != qemu1 || outcomes[1].target.ItemID != lxc || outcomes[2].target.ItemID != qemu2 {
		t.Fatalf("outcome order changed: %+v", outcomes)
	}
	if !outcomes[1].unsupported {
		t.Fatal("expected LXC target to be unsupported")
	}
	if outcomes[1].admitted || outcomes[1].claimed {
		t.Fatal("LXC target should not be admitted or claimed")
	}
	if acquireCount.Load() != 2 {
		t.Fatalf("acquire calls = %d, want 2", acquireCount.Load())
	}
	if convertCount.Load() != 2 {
		t.Fatalf("convert calls = %d, want 2", convertCount.Load())
	}
}

func TestRunBoundedVMTemplateConversionsDoesNotStartBeforeAdmission(t *testing.T) {
	hold := make(chan struct{})
	releaseHold := make(chan struct{})
	var convertStarted atomic.Bool

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

	done := make(chan []boundedVMTemplateOutcome, 1)
	go func() {
		done <- runBoundedVMTemplateConversions(context.Background(), 1, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
			convertStarted.Store(true)
			return true, false, nil
		})
	}()

	select {
	case <-hold:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for acquire to block")
	}
	if convertStarted.Load() {
		t.Fatal("convert started before admission release")
	}
	close(releaseHold)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for conversion completion")
	}
}

func TestRunBoundedVMTemplateConversionsReleasesAfterActionError(t *testing.T) {
	var active atomic.Int32
	targets := []verifiedVMTarget{{ItemID: uuid.New(), GuestType: proxmox.GuestQEMU}}

	acquireFn := func(ctx context.Context) (func(), error) {
		if active.Add(1) > 1 {
			return nil, errors.New("slot not released")
		}
		return func() { active.Add(-1) }, nil
	}

	outcomes := runBoundedVMTemplateConversions(context.Background(), 1, targets, acquireFn, func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
		return true, false, errors.New("convert failed")
	})
	if outcomes[0].err == nil {
		t.Fatal("expected convert error")
	}

	_, err := acquireFn(context.Background())
	if err != nil {
		t.Fatalf("slot was not released after convert error: %v", err)
	}
}
