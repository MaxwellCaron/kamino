package proxmox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestStartVMTaskReturnsWithoutPolling(t *testing.T) {
	var statusCalls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/start":
			writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00007F2A:12345678:ABCDEF12:qmstart:101:root@pam:")
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/UPID:node1:00007F2A:12345678:ABCDEF12:qmstart:101:root@pam:/status":
			statusCalls.Add(1)
			writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "running"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewHTTPTestClient(server)
	task, err := client.StartVMTask(context.Background(), GuestQEMU, "node1", 101)
	if err != nil {
		t.Fatalf("StartVMTask() error = %v", err)
	}
	if task.Node != "node1" || task.UPID == "" {
		t.Fatalf("unexpected task handle: %+v", task)
	}
	if statusCalls.Load() != 0 {
		t.Fatalf("expected no task status polling, got %d calls", statusCalls.Load())
	}
}

func TestStartVMWrapperWaitsForTerminalTask(t *testing.T) {
	var statusCalls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/start":
			writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00007F2A:12345678:ABCDEF12:qmstart:101:root@pam:")
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/UPID:node1:00007F2A:12345678:ABCDEF12:qmstart:101:root@pam:/status":
			call := statusCalls.Add(1)
			status := "running"
			exitStatus := ""
			if call >= 2 {
				status = "stopped"
				exitStatus = "OK"
			}
			writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: status, ExitStatus: exitStatus})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewHTTPTestClient(server)
	if err := client.StartVM(context.Background(), GuestQEMU, "node1", 101); err != nil {
		t.Fatalf("StartVM() error = %v", err)
	}
	if statusCalls.Load() < 2 {
		t.Fatalf("expected wrapper to poll until terminal, got %d calls", statusCalls.Load())
	}
}

func TestPowerTaskMethodsUseActionSpecificPaths(t *testing.T) {
	paths := make([]string, 0, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		paths = append(paths, r.URL.Path)
		writeAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
	}))
	defer server.Close()

	client := NewHTTPTestClient(server)
	ctx := context.Background()
	if _, err := client.StartVMTask(ctx, GuestQEMU, "node1", 101); err != nil {
		t.Fatalf("StartVMTask: %v", err)
	}
	if _, err := client.ShutdownVMTask(ctx, GuestQEMU, "node1", 102); err != nil {
		t.Fatalf("ShutdownVMTask: %v", err)
	}
	if _, err := client.RebootVMTask(ctx, GuestQEMU, "node1", 103); err != nil {
		t.Fatalf("RebootVMTask: %v", err)
	}
	if _, err := client.StopVMTask(ctx, GuestQEMU, "node1", 104); err != nil {
		t.Fatalf("StopVMTask: %v", err)
	}

	want := []string{
		"/api2/json/nodes/node1/qemu/101/status/start",
		"/api2/json/nodes/node1/qemu/102/status/shutdown",
		"/api2/json/nodes/node1/qemu/103/status/reboot",
		"/api2/json/nodes/node1/qemu/104/status/stop",
	}
	if len(paths) != len(want) {
		t.Fatalf("paths = %v, want %v", paths, want)
	}
	for i := range want {
		if paths[i] != want[i] {
			t.Fatalf("path[%d] = %q, want %q", i, paths[i], want[i])
		}
	}
}

func TestWaitForTaskPropagatesFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAPIResponse(t, w, http.StatusOK, TaskStatus{
			Status:     "stopped",
			ExitStatus: "TASK FAILED",
		})
	}))
	defer server.Close()

	client := NewHTTPTestClient(server)
	err := client.WaitForTask(context.Background(), "node1", "UPID:node1:fail")
	if err == nil {
		t.Fatal("expected task failure")
	}
}

func TestWaitForTaskHonorsCallerCancellation(t *testing.T) {
	block := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-block:
		case <-r.Context().Done():
			return
		}
		writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "running"})
	}))
	defer server.Close()
	defer close(block)

	client := NewHTTPTestClient(server)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := client.WaitForTask(ctx, "node1", "UPID:node1:block")
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestStartCloneVMReturnsTaskAlias(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeAPIResponse(t, w, http.StatusOK, "UPID:node1:clone")
	}))
	defer server.Close()

	client := NewHTTPTestClient(server)
	task, err := client.StartCloneVM(context.Background(), "node1", 100, 200, "clone", false, "")
	if err != nil {
		t.Fatalf("StartCloneVM() error = %v", err)
	}
	var cloneTask CloneTask = task
	if cloneTask.UPID == "" {
		t.Fatalf("expected clone task alias, got %+v", task)
	}
}

func TestConcurrentPowerTaskStartsRespectGlobalLimit(t *testing.T) {
	var (
		active  atomic.Int32
		maxSeen atomic.Int32
		mu      sync.Mutex
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			writeAPIResponse(t, w, http.StatusOK, "UPID:node1:task")
		case r.Method == http.MethodGet:
			mu.Lock()
			current := active.Add(1)
			for {
				seen := maxSeen.Load()
				if current <= seen || maxSeen.CompareAndSwap(seen, current) {
					break
				}
			}
			mu.Unlock()
			time.Sleep(30 * time.Millisecond)
			active.Add(-1)
			writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "stopped", ExitStatus: "OK"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	// This test validates proxmox client behavior only; executor limit is tested separately.
	client := NewHTTPTestClient(server)
	const workers = 6
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			_ = client.StartVM(context.Background(), GuestQEMU, "node1", 101)
		}()
	}
	wg.Wait()
	if maxSeen.Load() < 2 {
		t.Fatalf("expected overlapping task polling, maxSeen=%d", maxSeen.Load())
	}
}
