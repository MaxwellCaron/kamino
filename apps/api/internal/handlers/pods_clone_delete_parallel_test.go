package handlers

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func TestClonedPodVMDeleteTargetsPreservesOrderAndSkipsIncompleteRows(t *testing.T) {
	node1 := "node1"
	node2 := "node2"
	vmid1 := int32(101)
	vmid3 := int32(103)

	rows := []database.ListClonedPodVMsRow{
		{ClonedPodID: uuid.New(), Node: &node1, Vmid: &vmid1},
		{ClonedPodID: uuid.New(), Node: nil, Vmid: &vmid1},
		{ClonedPodID: uuid.New(), Node: &node2, Vmid: nil},
		{ClonedPodID: uuid.New(), Node: &node2, Vmid: &vmid3},
	}

	targets := clonedPodVMDeleteTargets(rows)
	if len(targets) != 2 {
		t.Fatalf("targets len = %d, want 2", len(targets))
	}
	if targets[0].Node != "node1" || targets[0].VMID != 101 {
		t.Fatalf("targets[0] = %+v, want node1/101", targets[0])
	}
	if targets[1].Node != "node2" || targets[1].VMID != 103 {
		t.Fatalf("targets[1] = %+v, want node2/103", targets[1])
	}
}

func TestRunBoundedClonedPodVMDeletesRespectsLimit(t *testing.T) {
	var active atomic.Int32
	var maxSeen atomic.Int32
	started := make(chan struct{}, 4)
	release := make(chan struct{})

	targets := []clonedPodVMDeleteTarget{
		{Node: "node1", VMID: 101},
		{Node: "node1", VMID: 102},
		{Node: "node1", VMID: 103},
		{Node: "node1", VMID: 104},
	}

	done := make(chan error, 1)
	go func() {
		done <- runBoundedClonedPodVMDeletes(context.Background(), 2, targets, func(ctx context.Context, node string, vmid int) error {
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
			return nil
		})
	}()

	waitForStarted := func(count int) {
		t.Helper()
		deadline := time.After(2 * time.Second)
		for i := 0; i < count; i++ {
			select {
			case <-started:
			case <-deadline:
				t.Fatalf("timed out waiting for %d started callbacks", count)
			}
		}
	}

	waitForStarted(2)
	if maxSeen.Load() != 2 {
		t.Fatalf("max overlap = %d, want 2", maxSeen.Load())
	}

	select {
	case <-started:
		t.Fatal("third callback started before release")
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runner completion")
	}
}

func TestRunBoundedClonedPodVMDeletesAttemptsAllTargetsAfterError(t *testing.T) {
	var attempted sync.Map
	errBoom := errors.New("boom")

	targets := []clonedPodVMDeleteTarget{
		{Node: "node1", VMID: 101},
		{Node: "node1", VMID: 102},
		{Node: "node1", VMID: 103},
	}

	err := runBoundedClonedPodVMDeletes(context.Background(), 2, targets, func(ctx context.Context, node string, vmid int) error {
		attempted.Store(vmid, true)
		if vmid == 102 {
			return errBoom
		}
		return nil
	})
	if err == nil {
		t.Fatal("expected joined error")
	}
	if !errors.Is(err, errBoom) {
		t.Fatalf("error = %v, want errors.Is boom", err)
	}
	for _, target := range targets {
		if _, ok := attempted.Load(target.VMID); !ok {
			t.Fatalf("target %d was not attempted", target.VMID)
		}
	}
}

func TestRunBoundedClonedPodVMDeletesJoinsErrorsWithTargetContext(t *testing.T) {
	errOne := errors.New("delete one failed")
	errTwo := errors.New("delete two failed")

	targets := []clonedPodVMDeleteTarget{
		{Node: "node-a", VMID: 201},
		{Node: "node-b", VMID: 202},
	}

	err := runBoundedClonedPodVMDeletes(context.Background(), 2, targets, func(ctx context.Context, node string, vmid int) error {
		switch vmid {
		case 201:
			return errOne
		case 202:
			return errTwo
		default:
			return nil
		}
	})
	if err == nil {
		t.Fatal("expected joined error")
	}
	if !errors.Is(err, errOne) || !errors.Is(err, errTwo) {
		t.Fatalf("errors.Is failed: %v", err)
	}
	message := err.Error()
	for _, part := range []string{"node-a", "201", "node-b", "202"} {
		if !strings.Contains(message, part) {
			t.Fatalf("error text = %q, want substring %q", message, part)
		}
	}
}

func TestRunBoundedClonedPodVMDeletesHandlesNoTargets(t *testing.T) {
	var calls atomic.Int32
	err := runBoundedClonedPodVMDeletes(context.Background(), 2, nil, func(ctx context.Context, node string, vmid int) error {
		calls.Add(1)
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("callback calls = %d, want 0", calls.Load())
	}
}
