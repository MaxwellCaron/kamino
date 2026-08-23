package vmactions

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func TestPowerLimiterBoundsGlobalOverlap(t *testing.T) {
	var (
		active  atomic.Int32
		maxSeen atomic.Int32
		block   = make(chan struct{})
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
			current := active.Add(1)
			for {
				seen := maxSeen.Load()
				if current <= seen || maxSeen.CompareAndSwap(seen, current) {
					break
				}
			}
			select {
			case <-block:
			case <-time.After(200 * time.Millisecond):
			}
			active.Add(-1)
			writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
				Status:     "stopped",
				ExitStatus: "OK",
			})
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
		PowerConfig{Concurrency: 2, TaskTimeout: time.Minute},
	)
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}

	const workers = 4
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			_ = executor.PowerAction(context.Background(), target, PowerActionStart)
		}()
	}

	deadline := time.After(300 * time.Millisecond)
	for {
		if maxSeen.Load() == 2 {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("max overlap = %d, want 2", maxSeen.Load())
		default:
			time.Sleep(5 * time.Millisecond)
		}
	}

	close(block)
	wg.Wait()
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

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			startCalls.Add(1)
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
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

	executor := NewExecutor(
		proxmox.NewHTTPTestClient(server),
		nil,
		nil,
		OperationConfig{Concurrency: 2},
		PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}

	firstDone := make(chan struct{})
	go func() {
		_ = executor.PowerAction(context.Background(), target, PowerActionStart)
		close(firstDone)
	}()

	time.Sleep(30 * time.Millisecond)

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
	<-firstDone
}

func TestPowerActionDrainsAcceptedTaskAfterCallerCancellation(t *testing.T) {
	var waitPolls atomic.Int32
	block := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			writePowerTestAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
			waitPolls.Add(1)
			select {
			case <-block:
				writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{
					Status:     "stopped",
					ExitStatus: "OK",
				})
			case <-time.After(500 * time.Millisecond):
				writePowerTestAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "running"})
			}
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
		PowerConfig{Concurrency: 2, TaskTimeout: 200 * time.Millisecond},
	)
	target := Target{Node: "node1", VMID: 101, GuestType: proxmox.GuestQEMU}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- executor.PowerAction(ctx, target, PowerActionStart)
	}()

	time.Sleep(30 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected drain to finish with error after caller cancellation or timeout")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("accepted task did not drain")
	}

	if waitPolls.Load() < 1 {
		t.Fatalf("wait polls = %d, want at least 1", waitPolls.Load())
	}
	close(block)
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
	if err == nil {
		t.Fatal("expected timeout error")
	}

	time.Sleep(10 * time.Millisecond)

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
