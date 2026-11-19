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
	"testing/synctest"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

type notifierTestTransport http.HandlerFunc

func (transport notifierTestTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response := httptest.NewRecorder()
	transport(response, request)
	if err := request.Context().Err(); err != nil {
		return nil, err
	}
	return response.Result(), nil
}

func TestRefreshNowCoalescesOverlappingCalls(t *testing.T) {
	server := httptest.NewServer(nil)
	defer server.Close()

	synctest.Test(t, func(t *testing.T) {
		var calls atomic.Int32
		block := make(chan struct{})
		server.Client().Transport = notifierTestTransport(func(w http.ResponseWriter, r *http.Request) {
			if !strings.Contains(r.URL.Path, "/cluster/resources") {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			calls.Add(1)
			<-block
			writeNotifierAPIResponse(t, w, []proxmox.VM{{VMID: 101, Node: "node1", Status: "running"}})
		})
		notifier := NewNotifier(proxmox.NewHTTPTestClient(server))
		const callers = 5
		errs := make(chan error, callers)
		for range callers {
			go func() { errs <- notifier.RefreshNow(context.Background()) }()
		}

		synctest.Wait()
		if got := calls.Load(); got != 1 {
			t.Errorf("GetVMs calls while refresh is blocked = %d, want 1", got)
		}
		close(block)
		for range callers {
			if err := <-errs; err != nil {
				t.Fatalf("RefreshNow() error = %v", err)
			}
		}
		if got := notifier.Current()[101]; got != "running" {
			t.Fatalf("refreshed status = %q, want running", got)
		}
		if got := calls.Load(); got != 1 {
			t.Fatalf("GetVMs calls = %d, want 1", got)
		}
	})
}

func TestRefreshNowCancelledWaiterDoesNotPoisonOthers(t *testing.T) {
	server := httptest.NewServer(nil)
	defer server.Close()

	synctest.Test(t, func(t *testing.T) {
		var calls atomic.Int32
		block := make(chan struct{})
		server.Client().Transport = notifierTestTransport(func(w http.ResponseWriter, r *http.Request) {
			calls.Add(1)
			<-block
			writeNotifierAPIResponse(t, w, []proxmox.VM{{VMID: 101, Node: "node1", Status: "running"}})
		})
		notifier := NewNotifier(proxmox.NewHTTPTestClient(server))
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		cancelled := make(chan error, 1)
		go func() { cancelled <- notifier.RefreshNow(ctx) }()
		synctest.Wait()
		done := make(chan error, 1)
		go func() { done <- notifier.RefreshNow(context.Background()) }()

		synctest.Wait()
		cancel()
		if err := <-cancelled; !errors.Is(err, context.Canceled) {
			t.Errorf("cancelled waiter error = %v, want context.Canceled", err)
		}
		close(block)
		if err := <-done; err != nil {
			t.Fatalf("second RefreshNow() error = %v", err)
		}
		if got := calls.Load(); got != 1 {
			t.Fatalf("GetVMs calls = %d, want 1", got)
		}
		if got := notifier.Current()[101]; got != "running" {
			t.Fatalf("remaining waiter did not refresh status: %q", got)
		}
	})
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
