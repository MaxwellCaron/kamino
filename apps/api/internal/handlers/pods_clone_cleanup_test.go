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

func TestRunFailedPodProvisionCleanupWaitsBeforeDelete(t *testing.T) {
	folderID := uuid.New()
	itemID := uuid.New()
	created := map[int]clonedVM{
		101: {
			TargetNode:      "node-a",
			VMID:            101,
			InventoryItemID: itemID,
			CloneTask:       proxmox.CloneTask{Node: "node-a", UPID: "UPID:101"},
		},
		102: {
			TargetNode: "node-b",
			VMID:       102,
			CloneTask:  proxmox.CloneTask{Node: "node-b", UPID: "UPID:102"},
		},
	}

	var (
		mu          sync.Mutex
		events      []string
		waitStarted sync.WaitGroup
		waitBlock   = make(chan struct{})
	)

	waitStarted.Add(2)
	cbs := failedPodProvisionCleanupCallbacks{
		waitCloneTask: func(ctx context.Context, node, upid string) error {
			waitStarted.Done()
			<-waitBlock
			mu.Lock()
			events = append(events, "wait:"+upid)
			mu.Unlock()
			return nil
		},
		deleteProxmoxVM: func(ctx context.Context, node string, vmid int) error {
			mu.Lock()
			events = append(events, "delete:"+node)
			mu.Unlock()
			return nil
		},
		deleteInventoryVM: func(ctx context.Context, itemID uuid.UUID) error {
			mu.Lock()
			events = append(events, "inventory:"+itemID.String())
			mu.Unlock()
			return nil
		},
		deleteFolder: func(ctx context.Context, folderID uuid.UUID) error {
			mu.Lock()
			events = append(events, "folder")
			mu.Unlock()
			return nil
		},
	}

	done := make(chan error, 1)
	go func() {
		done <- runFailedPodProvisionCleanup(context.Background(), folderID, created, 2, cbs)
	}()

	waitWithTimeout(t, &waitStarted, 2*time.Second)
	close(waitBlock)

	if err := readWithTimeout(t, done, 2*time.Second); err != nil {
		t.Fatalf("cleanup error = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, upid := range []string{"UPID:101", "UPID:102"} {
		waitIdx := indexOf(events, "wait:"+upid)
		deleteIdx := indexOf(events, "delete:"+createdVMNode(created, upid))
		if waitIdx < 0 || deleteIdx < 0 || waitIdx > deleteIdx {
			t.Fatalf("expected wait before delete for %s, events=%v", upid, events)
		}
	}
	if indexOf(events, "inventory:"+itemID.String()) < 0 {
		t.Fatalf("expected inventory delete for synced VM, events=%v", events)
	}
	if indexOf(events, "folder") < 0 {
		t.Fatalf("expected folder delete, events=%v", events)
	}
}

func TestRunFailedPodProvisionCleanupBoundedOverlap(t *testing.T) {
	created := map[int]clonedVM{
		1: {TargetNode: "node-a", VMID: 1, CloneTask: proxmox.CloneTask{Node: "node-a", UPID: "UPID:1"}},
		2: {TargetNode: "node-a", VMID: 2, CloneTask: proxmox.CloneTask{Node: "node-a", UPID: "UPID:2"}},
		3: {TargetNode: "node-a", VMID: 3, CloneTask: proxmox.CloneTask{Node: "node-a", UPID: "UPID:3"}},
	}

	var active atomic.Int32
	var maxActive atomic.Int32
	block := make(chan struct{})

	cbs := failedPodProvisionCleanupCallbacks{
		waitCloneTask: func(ctx context.Context, node, upid string) error {
			current := active.Add(1)
			for {
				prev := maxActive.Load()
				if current <= prev || maxActive.CompareAndSwap(prev, current) {
					break
				}
			}
			<-block
			active.Add(-1)
			return nil
		},
		deleteProxmoxVM: func(ctx context.Context, node string, vmid int) error {
			return nil
		},
	}

	done := make(chan error, 1)
	go func() {
		done <- runFailedPodProvisionCleanup(context.Background(), uuid.Nil, created, 2, cbs)
	}()

	deadline := time.After(2 * time.Second)
	for maxActive.Load() < 2 {
		select {
		case <-deadline:
			t.Fatalf("expected two cleanup workers to overlap, max active=%d", maxActive.Load())
		default:
			time.Sleep(5 * time.Millisecond)
		}
	}
	close(block)

	if err := readWithTimeout(t, done, 2*time.Second); err != nil {
		t.Fatalf("cleanup error = %v", err)
	}
	if got := maxActive.Load(); got != 2 {
		t.Fatalf("max active = %d, want 2", got)
	}
}

func TestRunFailedPodProvisionCleanupAttemptsAllOnFailure(t *testing.T) {
	itemOK := uuid.New()
	itemFail := uuid.New()
	created := map[int]clonedVM{
		201: {TargetNode: "node-a", VMID: 201, InventoryItemID: itemFail, CloneTask: proxmox.CloneTask{Node: "node-a", UPID: "UPID:201"}},
		202: {TargetNode: "node-b", VMID: 202, InventoryItemID: itemOK, CloneTask: proxmox.CloneTask{Node: "node-b", UPID: "UPID:202"}},
	}

	var deletedVMs sync.Map
	var deletedInventory sync.Map

	cbs := failedPodProvisionCleanupCallbacks{
		waitCloneTask: func(ctx context.Context, node, upid string) error {
			if upid == "UPID:201" {
				return errors.New("wait failed")
			}
			return nil
		},
		deleteProxmoxVM: func(ctx context.Context, node string, vmid int) error {
			if vmid == 201 {
				return errors.New("delete failed")
			}
			deletedVMs.Store(vmid, true)
			return nil
		},
		deleteInventoryVM: func(ctx context.Context, itemID uuid.UUID) error {
			deletedInventory.Store(itemID, true)
			return nil
		},
	}

	err := runFailedPodProvisionCleanup(context.Background(), uuid.Nil, created, 2, cbs)
	if err == nil {
		t.Fatal("expected cleanup error")
	}

	if _, ok := deletedVMs.Load(202); !ok {
		t.Fatal("expected VM 202 Proxmox deletion to be attempted")
	}
	if _, ok := deletedInventory.Load(itemOK); !ok {
		t.Fatal("expected inventory delete after successful Proxmox delete")
	}
	if _, ok := deletedInventory.Load(itemFail); ok {
		t.Fatal("expected inventory delete to be skipped when Proxmox delete failed")
	}
}

func TestRunFailedPodProvisionCleanupSkipsFolderOnProxmoxFailure(t *testing.T) {
	folderID := uuid.New()
	created := map[int]clonedVM{
		301: {TargetNode: "node-a", VMID: 301, CloneTask: proxmox.CloneTask{Node: "node-a", UPID: "UPID:301"}},
	}

	var folderDeleted atomic.Bool
	cbs := failedPodProvisionCleanupCallbacks{
		waitCloneTask: func(ctx context.Context, node, upid string) error { return nil },
		deleteProxmoxVM: func(ctx context.Context, node string, vmid int) error {
			return errors.New("delete failed")
		},
		deleteFolder: func(ctx context.Context, id uuid.UUID) error {
			folderDeleted.Store(true)
			return nil
		},
	}

	if err := runFailedPodProvisionCleanup(context.Background(), folderID, created, 1, cbs); err == nil {
		t.Fatal("expected cleanup error")
	}
	if folderDeleted.Load() {
		t.Fatal("expected folder deletion to be skipped when Proxmox deletion failed")
	}
}

func TestRunFailedPodProvisionCleanupEmptyMapDeletesFolder(t *testing.T) {
	folderID := uuid.New()
	var folderDeleted atomic.Bool

	cbs := failedPodProvisionCleanupCallbacks{
		deleteFolder: func(ctx context.Context, id uuid.UUID) error {
			if id != folderID {
				t.Fatalf("folderID = %s, want %s", id, folderID)
			}
			folderDeleted.Store(true)
			return nil
		},
	}

	if err := runFailedPodProvisionCleanup(context.Background(), folderID, nil, 2, cbs); err != nil {
		t.Fatalf("cleanup error = %v", err)
	}
	if !folderDeleted.Load() {
		t.Fatal("expected folder deletion for empty created map")
	}
}

func createdVMNode(created map[int]clonedVM, upid string) string {
	for _, clone := range created {
		if clone.CloneTask.UPID == upid {
			return clone.TargetNode
		}
	}
	return ""
}

func indexOf(values []string, want string) int {
	for i, value := range values {
		if value == want {
			return i
		}
	}
	return -1
}

func waitWithTimeout(t *testing.T, wg *sync.WaitGroup, timeout time.Duration) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
		t.Fatal("timed out waiting for wait group")
	}
}

func readWithTimeout[T any](t *testing.T, ch <-chan T, timeout time.Duration) T {
	t.Helper()
	select {
	case value := <-ch:
		return value
	case <-time.After(timeout):
		t.Fatal("timed out waiting for channel value")
		return *new(T)
	}
}
