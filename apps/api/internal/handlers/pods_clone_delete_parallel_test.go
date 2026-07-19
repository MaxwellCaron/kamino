package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
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

func TestDeleteClonedPodProxmoxVMsShareGlobalOperationLimitAcrossPods(t *testing.T) {
	const operationLimit = 5

	var (
		destroyMu         sync.Mutex
		destroyCounts     = make(map[int]int)
		destroyStarted    = make(chan int, 6)
		activeDestroys    atomic.Int32
		maxActiveDestroys atomic.Int32
		statusUnblock     = make(chan struct{}, 6)
	)

	recordDestroy := func(vmid int) {
		destroyMu.Lock()
		destroyCounts[vmid]++
		destroyMu.Unlock()

		current := activeDestroys.Add(1)
		for {
			seen := maxActiveDestroys.Load()
			if current <= seen || maxActiveDestroys.CompareAndSwap(seen, current) {
				break
			}
		}
		destroyStarted <- vmid
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/qemu/"):
			parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
			vmid, err := strconv.Atoi(parts[len(parts)-1])
			if err != nil {
				t.Fatalf("parse vmid from %q: %v", r.URL.Path, err)
			}
			recordDestroy(vmid)
			upid := fmt.Sprintf("UPID:node1:00000000:00000000:00000000:qmdestroy:%d:user@pve:", vmid)
			writeProxmoxAPIResponse(t, w, http.StatusOK, upid)
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/tasks/"):
			select {
			case <-statusUnblock:
			case <-time.After(5 * time.Second):
				t.Error("timed out waiting for task-status unblock")
			}
			activeDestroys.Add(-1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			if err := json.NewEncoder(w).Encode(map[string]any{
				"data": proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"},
			}); err != nil {
				t.Fatalf("encode task status: %v", err)
			}
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), operationLimit)

	makeBatch := func(clonedPodID uuid.UUID, baseVMID int32) []database.ListClonedPodVMsRow {
		node := "node1"
		rows := make([]database.ListClonedPodVMsRow, 3)
		for i := range rows {
			vmid := baseVMID + int32(i)
			rows[i] = database.ListClonedPodVMsRow{
				ClonedPodID: clonedPodID,
				Node:        &node,
				Vmid:        &vmid,
			}
		}
		return rows
	}

	batch1 := makeBatch(uuid.New(), 101)
	batch2 := makeBatch(uuid.New(), 201)

	done := make(chan error, 2)
	go func() {
		done <- handler.deleteClonedPodProxmoxVMs(context.Background(), batch1)
	}()
	go func() {
		done <- handler.deleteClonedPodProxmoxVMs(context.Background(), batch2)
	}()

	for i := 0; i < operationLimit; i++ {
		select {
		case <-destroyStarted:
		case <-time.After(5 * time.Second):
			t.Fatalf("timed out waiting for destroy request %d", i+1)
		}
	}
	if maxActiveDestroys.Load() != operationLimit {
		t.Fatalf("max active destroys = %d, want %d", maxActiveDestroys.Load(), operationLimit)
	}

	select {
	case vmid := <-destroyStarted:
		t.Fatalf("sixth destroy for VMID %d started before a shared slot was released", vmid)
	case <-time.After(100 * time.Millisecond):
	}

	statusUnblock <- struct{}{}
	select {
	case <-destroyStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for sixth destroy after releasing a shared slot")
	}

	if maxActiveDestroys.Load() != operationLimit {
		t.Fatalf("max active destroys after release = %d, want %d", maxActiveDestroys.Load(), operationLimit)
	}

	for i := 0; i < operationLimit; i++ {
		statusUnblock <- struct{}{}
	}

	for i := 0; i < 2; i++ {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("deleteClonedPodProxmoxVMs() error = %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for pod delete batches")
		}
	}

	destroyMu.Lock()
	defer destroyMu.Unlock()
	if len(destroyCounts) != 6 {
		t.Fatalf("destroy VMIDs = %d, want 6", len(destroyCounts))
	}
	for _, vmid := range []int{101, 102, 103, 201, 202, 203} {
		if count := destroyCounts[vmid]; count != 1 {
			t.Fatalf("VMID %d destroy count = %d, want 1", vmid, count)
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
