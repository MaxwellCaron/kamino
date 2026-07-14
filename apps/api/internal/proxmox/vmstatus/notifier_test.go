package vmstatus

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func TestRefreshNowCoalescesOverlappingCalls(t *testing.T) {
	var calls atomic.Int32
	block := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/cluster/resources") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		calls.Add(1)
		<-block
		writeNotifierAPIResponse(t, w, []proxmox.VM{{VMID: 101, Node: "node1", Status: "running"}})
	}))
	defer server.Close()

	notifier := NewNotifier(proxmox.NewHTTPTestClient(server))

	const callers = 5
	errs := make(chan error, callers)
	for i := 0; i < callers; i++ {
		go func() {
			errs <- notifier.RefreshNow(context.Background())
		}()
	}

	time.Sleep(30 * time.Millisecond)
	close(block)

	for i := 0; i < callers; i++ {
		if err := <-errs; err != nil {
			t.Fatalf("RefreshNow() error = %v", err)
		}
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("GetVMs calls = %d, want 1", got)
	}
}

func TestRefreshNowCancelledWaiterDoesNotPoisonOthers(t *testing.T) {
	var calls atomic.Int32
	block := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		<-block
		writeNotifierAPIResponse(t, w, []proxmox.VM{{VMID: 101, Node: "node1", Status: "running"}})
	}))
	defer server.Close()

	notifier := NewNotifier(proxmox.NewHTTPTestClient(server))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := notifier.RefreshNow(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled waiter error = %v, want context.Canceled", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- notifier.RefreshNow(context.Background())
	}()
	time.Sleep(30 * time.Millisecond)
	close(block)
	if err := <-done; err != nil {
		t.Fatalf("second RefreshNow() error = %v", err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("GetVMs calls = %d, want 1", got)
	}
}

func TestRefreshUntilStatusesMatchesAllTargets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeNotifierAPIResponse(t, w, []proxmox.VM{
			{VMID: 101, Node: "node1", Status: "stopped"},
			{VMID: 102, Node: "node1", Status: "stopped"},
		})
	}))
	defer server.Close()

	notifier := NewNotifier(proxmox.NewHTTPTestClient(server))
	err := notifier.RefreshUntilStatuses(context.Background(), map[int]string{
		101: "stopped",
		102: "stopped",
	})
	if err != nil {
		t.Fatalf("RefreshUntilStatuses() error = %v", err)
	}
}

func TestRefreshUntilStatusesRetriesAfterFailedSharedRefresh(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			http.Error(w, "temporary upstream failure", http.StatusBadGateway)
			return
		}
		writeNotifierAPIResponse(t, w, []proxmox.VM{{VMID: 101, Node: "node1", Status: "running"}})
	}))
	defer server.Close()

	notifier := NewNotifier(proxmox.NewHTTPTestClient(server))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := notifier.RefreshUntilStatus(ctx, 101, "running")
	if err != nil {
		t.Fatalf("RefreshUntilStatus() error = %v", err)
	}
	if calls.Load() < 2 {
		t.Fatalf("expected retry after failed refresh, calls = %d", calls.Load())
	}
}

func writeNotifierAPIResponse(t *testing.T, w http.ResponseWriter, vms []proxmox.VM) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{"data": vms}); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}
