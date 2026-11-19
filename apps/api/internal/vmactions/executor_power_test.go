package vmactions

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func TestPowerLimiterBoundsGlobalOverlap(t *testing.T) {
	const workers = 4
	var active atomic.Int32
	var maxSeen atomic.Int32
	started := make(chan struct{}, workers)
	block := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case http.MethodGet:
			current := active.Add(1)
			defer active.Add(-1)
			for {
				seen := maxSeen.Load()
				if current <= seen || maxSeen.CompareAndSwap(seen, current) {
					break
				}
			}
			started <- struct{}{}
			<-block
			writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"})
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			http.Error(w, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	defer func() {
		select {
		case <-block:
		default:
			close(block)
		}
	}()

	executor := NewExecutor(proxmox.NewHTTPTestClient(server), nil, nil,
		OperationConfig{Concurrency: 2}, PowerConfig{Concurrency: 2, TaskTimeout: time.Minute})
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}
	done := make(chan error, workers)
	for range workers {
		go func() { done <- executor.PowerAction(context.Background(), target, PowerActionStart) }()
	}

	for range 2 {
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			t.Fatal("expected two power actions to overlap")
		}
	}
	close(block)
	for range workers {
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("PowerAction() = %v", err)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("power action did not finish")
		}
	}
	if got := maxSeen.Load(); got != 2 {
		t.Fatalf("max overlap = %d, want 2", got)
	}
}

func TestPowerActionRejectsInvalidActionBeforeAdmission(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	executor := NewExecutor(
		proxmox.NewHTTPTestClient(server),
		nil,
		nil,
		OperationConfig{Concurrency: 2},
		PowerConfig{Concurrency: 2, TaskTimeout: time.Minute},
	)

	err := executor.PowerAction(context.Background(), Target{VMID: 1}, PowerAction("pause"))
	if !errors.Is(err, ErrInvalidPowerAction) {
		t.Fatalf("error = %v, want ErrInvalidPowerAction", err)
	}
}

func TestPowerActionQueuedCancellationDoesNotStartTask(t *testing.T) {
	var startCalls atomic.Int32
	block := make(chan struct{})
	started := make(chan struct{}, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			startCalls.Add(1)
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
			started <- struct{}{}
			<-block
			writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
				Status:     "stopped",
				ExitStatus: "OK",
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()
	defer func() {
		select {
		case <-block:
		default:
			close(block)
		}
	}()

	executor := NewExecutor(
		proxmox.NewHTTPTestClient(server),
		nil,
		nil,
		OperationConfig{Concurrency: 2},
		PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- executor.PowerAction(context.Background(), target, PowerActionStart)
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("first power action did not start polling")
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := executor.PowerAction(ctx, target, PowerActionStart)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if startCalls.Load() != 1 {
		t.Fatalf("start calls = %d, want 1", startCalls.Load())
	}

	close(block)
	select {
	case err := <-firstDone:
		if err != nil {
			t.Fatalf("first power action failed: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("first power action did not finish")
	}
}

func TestPowerActionDrainsAcceptedTaskAfterCallerCancellation(t *testing.T) {
	polling := make(chan struct{}, 1)
	block := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case http.MethodGet:
			polling <- struct{}{}
			select {
			case <-block:
				writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"})
			case <-r.Context().Done():
			}
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			http.Error(w, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	defer func() {
		select {
		case <-block:
		default:
			close(block)
		}
	}()

	executor := NewExecutor(proxmox.NewHTTPTestClient(server), nil, nil,
		OperationConfig{Concurrency: 2}, PowerConfig{Concurrency: 1, TaskTimeout: time.Minute})
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- executor.PowerAction(ctx, target, PowerActionStart) }()

	select {
	case <-polling:
	case <-time.After(2 * time.Second):
		t.Fatal("accepted power task did not start polling")
	}
	cancel()
	close(block)
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("accepted task should complete despite caller cancellation: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("accepted task did not drain")
	}
}

func TestPowerActionTimeoutReleasesSlot(t *testing.T) {
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
			if polls.Add(1) > 1 {
				writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
					Status:     "stopped",
					ExitStatus: "OK",
				})
				return
			}
			writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "running"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	executor := NewExecutor(
		proxmox.NewHTTPTestClient(server),
		nil,
		nil,
		OperationConfig{Concurrency: 2},
		PowerConfig{Concurrency: 1, TaskTimeout: 75 * time.Millisecond},
	)
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}

	err := executor.PowerAction(context.Background(), target, PowerActionStart)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want context.DeadlineExceeded", err)
	}

	if err := executor.PowerAction(context.Background(), target, PowerActionStart); err != nil {
		t.Fatalf("second action after timeout release failed: %v", err)
	}
}

func writePowerTestAPIResponse(t *testing.T, w http.ResponseWriter, status int, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write([]byte(`{"data":` + mustJSON(t, data) + `}`)); err != nil {
		t.Fatalf("write response: %v", err)
	}
}

func mustJSON(t *testing.T, data any) string {
	t.Helper()
	switch value := data.(type) {
	case string:
		return `"` + value + `"`
	case proxmox.TaskStatus:
		return `{"status":"` + value.Status + `","exitstatus":"` + value.ExitStatus + `"}`
	default:
		t.Fatalf("unsupported test json type %T", data)
		return ""
	}
}
