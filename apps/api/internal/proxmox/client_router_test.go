package proxmox

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

func newTestClient(server *httptest.Server) *Client {
	return &Client{
		baseURL: server.URL,
		tokenID: "token",
		secret:  "secret",
		nodes:   []string{"node1"},
		nodeIndex: map[string]int{
			"node1": 0,
		},
		httpClient: server.Client(),
	}
}

func writeAPIResponse(t *testing.T, w http.ResponseWriter, status int, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]any{"data": data}); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func TestSetVMNetworkBridgePreservesNICShape(t *testing.T) {
	var (
		putForm url.Values
		putPath string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			writeAPIResponse(t, w, http.StatusOK, map[string]any{
				"name":  "router",
				"scsi0": "local-lvm:vm-101-disk-0,size=10G",
				"net0":  "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
				"net1":  "virtio=11:22:33:44:55:66,bridge=vmbr1,tag=200",
			})
		case r.Method == http.MethodPut && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			putPath = r.URL.Path
			putForm = r.PostForm
			writeAPIResponse(t, w, http.StatusOK, nil)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.SetVMNetworkBridge(context.Background(), "node1", 101, "net1", "kamino24"); err != nil {
		t.Fatalf("SetVMNetworkBridge() error = %v", err)
	}

	if putPath == "" {
		t.Fatalf("expected PUT request")
	}
	if got := putForm.Get("net1"); got != "virtio=11:22:33:44:55:66,bridge=kamino24,firewall=1,tag=200" {
		t.Fatalf("net1 payload = %q", got)
	}
	if got := putForm.Get("net0"); got != "" {
		t.Fatalf("unexpected net0 payload = %q", got)
	}
}

func TestSetVMCloudInitCustomSendsExpectedPayload(t *testing.T) {
	var (
		putForm url.Values
		putPath string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPut && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			putPath = r.URL.Path
			putForm = r.PostForm
			writeAPIResponse(t, w, http.StatusOK, nil)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.SetVMCloudInitCustom(
		context.Background(),
		"node1",
		101,
		"local",
		"kamino-router-24-user-data.yaml",
		"kamino-router-network-config.yaml",
	); err != nil {
		t.Fatalf("SetVMCloudInitCustom() error = %v", err)
	}

	if putPath == "" {
		t.Fatalf("expected PUT request")
	}
	if got := putForm.Get("citype"); got != "nocloud" {
		t.Fatalf("citype payload = %q", got)
	}
	if got := putForm.Get("cicustom"); got != "user=local:snippets/kamino-router-24-user-data.yaml,network=local:snippets/kamino-router-network-config.yaml" {
		t.Fatalf("cicustom payload = %q", got)
	}
}

func TestEnsureVMCloudInitDrive(t *testing.T) {
	t.Run("configured", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet || r.URL.Path != "/api2/json/nodes/node1/qemu/101/config" {
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
			}
			writeAPIResponse(t, w, http.StatusOK, map[string]any{
				"ide2": "local-lvm:cloudinit",
				"net0": "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
			})
		}))
		defer server.Close()

		client := newTestClient(server)
		if err := client.EnsureVMCloudInitDrive(context.Background(), "node1", 101); err != nil {
			t.Fatalf("EnsureVMCloudInitDrive() error = %v", err)
		}
	})

	t.Run("missing", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet || r.URL.Path != "/api2/json/nodes/node1/qemu/101/config" {
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
			}
			writeAPIResponse(t, w, http.StatusOK, map[string]any{
				"scsi0": "local-lvm:vm-101-disk-0,size=10G",
			})
		}))
		defer server.Close()

		client := newTestClient(server)
		err := client.EnsureVMCloudInitDrive(context.Background(), "node1", 101)
		if err == nil {
			t.Fatalf("expected missing cloud-init drive error")
		}
		if got := err.Error(); got != "VM 101 has no cloud-init drive configured" {
			t.Fatalf("EnsureVMCloudInitDrive() error = %q", got)
		}
	})
}

func TestGetVMRuntimeStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api2/json/nodes/node1/qemu/101/status/current" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
		writeAPIResponse(t, w, http.StatusOK, map[string]any{"status": "stopped"})
	}))
	defer server.Close()

	client := newTestClient(server)
	status, err := client.GetVMRuntimeStatus(context.Background(), GuestQEMU, "node1", 101)
	if err != nil {
		t.Fatalf("GetVMRuntimeStatus() error = %v", err)
	}
	if status != "stopped" {
		t.Fatalf("GetVMRuntimeStatus() = %q, want %q", status, "stopped")
	}
}

func TestWaitForVMRuntimeStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api2/json/nodes/node1/qemu/101/status/current" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
		writeAPIResponse(t, w, http.StatusOK, map[string]any{"status": "running"})
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.WaitForVMRuntimeStatus(context.Background(), GuestQEMU, "node1", 101, "running", 3*time.Second); err != nil {
		t.Fatalf("WaitForVMRuntimeStatus() error = %v", err)
	}
}

func TestWaitForVMConfigUnlocked(t *testing.T) {
	var mu sync.Mutex
	requests := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api2/json/nodes/node1/qemu/101/config" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}

		mu.Lock()
		requests++
		current := requests
		mu.Unlock()

		if current == 1 {
			writeAPIResponse(t, w, http.StatusOK, map[string]any{"lock": "clone"})
			return
		}
		writeAPIResponse(t, w, http.StatusOK, map[string]any{})
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.WaitForVMConfigUnlocked(context.Background(), "node1", 101, 3*time.Second); err != nil {
		t.Fatalf("WaitForVMConfigUnlocked() error = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if requests < 2 {
		t.Fatalf("expected at least 2 config requests, got %d", requests)
	}
}

func TestDeleteVMStopped(t *testing.T) {
	t.Run("stopped VM", func(t *testing.T) {
		var (
			stopCalled   bool
			deleteCalled bool
			requests     []string
			mu           sync.Mutex
		)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			requests = append(requests, r.Method+" "+r.URL.Path)
			mu.Unlock()

			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/current":
				writeAPIResponse(t, w, http.StatusOK, map[string]any{"status": "stopped"})
			case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/stop":
				stopCalled = true
				writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00000000:00000000:00000000:qmstop:101:user@pve:")
			case r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101":
				deleteCalled = true
				writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:")
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:/status":
				writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "stopped", ExitStatus: "OK"})
			default:
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
			}
		}))
		defer server.Close()

		client := newTestClient(server)
		err := client.DeleteVMStopped(context.Background(), GuestQEMU, "node1", 101)
		if err != nil {
			t.Fatalf("DeleteVMStopped() error = %v", err)
		}

		if stopCalled {
			t.Errorf("expected StopVM not to be called for stopped VM")
		}
		if !deleteCalled {
			t.Errorf("expected DeleteVM to be called")
		}

		expectedRequests := []string{
			"GET /api2/json/nodes/node1/qemu/101/status/current",
			"DELETE /api2/json/nodes/node1/qemu/101",
			"GET /api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:/status",
		}
		if len(requests) != len(expectedRequests) {
			t.Fatalf("got %d requests, want %d: %v", len(requests), len(expectedRequests), requests)
		}
		for i, req := range expectedRequests {
			if requests[i] != req {
				t.Errorf("request %d = %q, want %q", i, requests[i], req)
			}
		}
	})

	t.Run("running VM", func(t *testing.T) {
		var (
			requests []string
			mu       sync.Mutex
		)

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			requests = append(requests, r.Method+" "+r.URL.Path)
			mu.Unlock()

			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/current":
				writeAPIResponse(t, w, http.StatusOK, map[string]any{"status": "running"})
			case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/status/stop":
				writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00000000:00000000:00000000:qmstop:101:user@pve:")
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmstop:101:user@pve:/status":
				writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "stopped", ExitStatus: "OK"})
			case r.Method == http.MethodDelete && r.URL.Path == "/api2/json/nodes/node1/qemu/101":
				writeAPIResponse(t, w, http.StatusOK, "UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:")
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:/status":
				writeAPIResponse(t, w, http.StatusOK, TaskStatus{Status: "stopped", ExitStatus: "OK"})
			default:
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
			}
		}))
		defer server.Close()

		client := newTestClient(server)
		err := client.DeleteVMStopped(context.Background(), GuestQEMU, "node1", 101)
		if err != nil {
			t.Fatalf("DeleteVMStopped() error = %v", err)
		}

		expectedRequests := []string{
			"GET /api2/json/nodes/node1/qemu/101/status/current",
			"POST /api2/json/nodes/node1/qemu/101/status/stop",
			"GET /api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmstop:101:user@pve:/status",
			"DELETE /api2/json/nodes/node1/qemu/101",
			"GET /api2/json/nodes/node1/tasks/UPID:node1:00000000:00000000:00000000:qmdestroy:101:user@pve:/status",
		}
		if len(requests) != len(expectedRequests) {
			t.Fatalf("got %d requests, want %d: %v", len(requests), len(expectedRequests), requests)
		}
		for i, req := range expectedRequests {
			if requests[i] != req {
				t.Errorf("request %d = %q, want %q", i, requests[i], req)
			}
		}
	})
}
