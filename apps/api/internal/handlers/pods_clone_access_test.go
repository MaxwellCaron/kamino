package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
)

const (
	testDeleteNode = "node1"
	testDeleteVMID = 101
	deleteUPID     = "UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:"
	stopUPID       = "UPID:node1:00000000:00000000:00000000:qmstop:101:user@pve:"
)

func newDeleteTestHandler(client *proxmox.Client, operationConcurrency int) *PodsHandler {
	executor := vmactions.NewExecutor(
		client,
		nil,
		nil,
		vmactions.OperationConfig{Concurrency: operationConcurrency},
		vmactions.PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)
	return &PodsHandler{
		PX:      client,
		Actions: executor,
	}
}

func writeProxmoxAPIResponse(t *testing.T, w http.ResponseWriter, status int, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]any{"data": data}); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func TestDeleteClonedPodProxmoxVMDeletesStoppedVMAndReleasesSlot(t *testing.T) {
	var requests []string
	var mu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.Method+" "+r.URL.Path)
		mu.Unlock()

		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101":
			writeProxmoxAPIResponse(t, w, http.StatusOK, deleteUPID)
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/"+deleteUPID+"/status":
			writeProxmoxAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), 1)
	if err := handler.deleteClonedPodProxmoxVM(context.Background(), testDeleteNode, testDeleteVMID); err != nil {
		t.Fatalf("deleteClonedPodProxmoxVM() error = %v", err)
	}

	mu.Lock()
	gotRequests := append([]string(nil), requests...)
	mu.Unlock()
	wantRequests := []string{
		"DELETE /api2/json/nodes/node1/qemu/101",
		"GET /api2/json/nodes/node1/tasks/" + deleteUPID + "/status",
	}
	if len(gotRequests) != len(wantRequests) {
		t.Fatalf("requests = %v, want %v", gotRequests, wantRequests)
	}
	for i := range wantRequests {
		if gotRequests[i] != wantRequests[i] {
			t.Fatalf("request[%d] = %q, want %q", i, gotRequests[i], wantRequests[i])
		}
	}

	acquireCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	release, err := handler.Actions.AcquireOperationSlot(acquireCtx)
	if err != nil {
		t.Fatalf("slot was not released after successful delete: %v", err)
	}
	release()
}

func TestDeleteClonedPodProxmoxVMStopsRunningVMAndRetriesDelete(t *testing.T) {
	var requests []string
	var mu sync.Mutex
	deleteAttempts := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.Method+" "+r.URL.Path)
		mu.Unlock()

		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101":
			deleteAttempts++
			if deleteAttempts == 1 {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"errors":{"message":"VM is running"}}`))
				return
			}
			writeProxmoxAPIResponse(t, w, http.StatusOK, deleteUPID)
		case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/stop":
			writeProxmoxAPIResponse(t, w, http.StatusOK, stopUPID)
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/"+stopUPID+"/status":
			writeProxmoxAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"})
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/"+deleteUPID+"/status":
			writeProxmoxAPIResponse(t, w, http.StatusOK, proxmox.TaskStatus{Status: "stopped", ExitStatus: "OK"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), 1)
	if err := handler.deleteClonedPodProxmoxVM(context.Background(), testDeleteNode, testDeleteVMID); err != nil {
		t.Fatalf("deleteClonedPodProxmoxVM() error = %v", err)
	}

	mu.Lock()
	gotRequests := append([]string(nil), requests...)
	mu.Unlock()
	wantRequests := []string{
		"DELETE /api2/json/nodes/node1/qemu/101",
		"POST /api2/json/nodes/node1/qemu/101/status/stop",
		"GET /api2/json/nodes/node1/tasks/" + stopUPID + "/status",
		"DELETE /api2/json/nodes/node1/qemu/101",
		"GET /api2/json/nodes/node1/tasks/" + deleteUPID + "/status",
	}
	if len(gotRequests) != len(wantRequests) {
		t.Fatalf("requests = %v, want %v", gotRequests, wantRequests)
	}
	for i := range wantRequests {
		if gotRequests[i] != wantRequests[i] {
			t.Fatalf("request[%d] = %q, want %q", i, gotRequests[i], wantRequests[i])
		}
	}
}

func TestDeleteClonedPodProxmoxVMMissingVMIsSuccess(t *testing.T) {
	var requests []string
	var mu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.Method+" "+r.URL.Path)
		mu.Unlock()

		if r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"errors":{"message":"Configuration file 'qemu-server/101.conf' does not exist"}}`))
			return
		}
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), 1)
	if err := handler.deleteClonedPodProxmoxVM(context.Background(), testDeleteNode, testDeleteVMID); err != nil {
		t.Fatalf("deleteClonedPodProxmoxVM() error = %v", err)
	}

	mu.Lock()
	gotRequests := append([]string(nil), requests...)
	mu.Unlock()
	if len(gotRequests) != 1 {
		t.Fatalf("requests = %v, want one delete attempt", gotRequests)
	}
}

func TestDeleteClonedPodProxmoxVMCanceledAcquireMakesNoRequest(t *testing.T) {
	var requests atomicRequests

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.append(r.Method + " " + r.URL.Path)
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), 1)
	holdCtx, holdCancel := context.WithCancel(context.Background())
	defer holdCancel()

	release, err := handler.Actions.AcquireOperationSlot(holdCtx)
	if err != nil {
		t.Fatalf("AcquireOperationSlot() error = %v", err)
	}
	defer release()

	waitCtx, cancel := context.WithCancel(context.Background())
	cancel()

	err = handler.deleteClonedPodProxmoxVM(waitCtx, testDeleteNode, testDeleteVMID)
	if err == nil {
		t.Fatal("expected canceled acquire error")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if requests.len() != 0 {
		t.Fatalf("requests = %v, want none", requests.snapshot())
	}
}

func TestDeleteClonedPodProxmoxVMReleasesSlotAfterError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101":
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"errors":{"message":"delete failed"}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/stop":
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"errors":{"message":"stop failed"}}`))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	handler := newDeleteTestHandler(proxmox.NewHTTPTestClient(server), 1)
	err := handler.deleteClonedPodProxmoxVM(context.Background(), testDeleteNode, testDeleteVMID)
	if err == nil {
		t.Fatal("expected delete error")
	}

	acquireCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	release, acquireErr := handler.Actions.AcquireOperationSlot(acquireCtx)
	if acquireErr != nil {
		t.Fatalf("slot was not released after error: %v", acquireErr)
	}
	release()
}

type atomicRequests struct {
	mu   sync.Mutex
	path []string
}

func (r *atomicRequests) append(path string) {
	r.mu.Lock()
	r.path = append(r.path, path)
	r.mu.Unlock()
}

func (r *atomicRequests) len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.path)
}

func (r *atomicRequests) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.path...)
}
