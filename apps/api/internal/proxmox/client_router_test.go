package proxmox

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

func TestWaitForGuestAgentRetriesUntilSuccess(t *testing.T) {
	var mu sync.Mutex
	requests := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api2/json/nodes/node1/qemu/101/agent/ping" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}

		mu.Lock()
		requests++
		current := requests
		mu.Unlock()

		if current == 1 {
			http.Error(w, "not ready", http.StatusInternalServerError)
			return
		}
		writeAPIResponse(t, w, http.StatusOK, nil)
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.WaitForGuestAgent(context.Background(), "node1", 101, 2*time.Second); err != nil {
		t.Fatalf("WaitForGuestAgent() error = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if requests < 2 {
		t.Fatalf("expected retry, got %d request(s)", requests)
	}
}

func TestRunGuestCommandFailsOnNonZeroExitCode(t *testing.T) {
	var (
		mu                 sync.Mutex
		execCommandPayload []string
		statusRequests     int
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api2/json/nodes/node1/qemu/101/agent/exec":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			mu.Lock()
			execCommandPayload = append([]string(nil), r.PostForm["command"]...)
			mu.Unlock()
			writeAPIResponse(t, w, http.StatusOK, map[string]any{"pid": 42})
		case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/agent/exec-status":
			if got := r.URL.Query().Get("pid"); got != "42" {
				t.Fatalf("pid query = %q, want 42", got)
			}
			mu.Lock()
			statusRequests++
			current := statusRequests
			mu.Unlock()
			if current == 1 {
				writeAPIResponse(t, w, http.StatusOK, map[string]any{
					"exited":   false,
					"exitcode": 0,
					"out-data": "",
					"err-data": "",
				})
				return
			}
			writeAPIResponse(t, w, http.StatusOK, map[string]any{
				"exited":   true,
				"exitcode": 9,
				"out-data": "stdout detail",
				"err-data": "stderr detail",
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	client := newTestClient(server)
	err := client.RunGuestCommand(
		context.Background(),
		"node1",
		101,
		[]string{"sed", "-i", "-e", "s/a/b/g", "/config/script"},
		3*time.Second,
	)
	if err == nil {
		t.Fatalf("RunGuestCommand() error = nil, want non-nil")
	}
	if !strings.Contains(err.Error(), "code 9") {
		t.Fatalf("RunGuestCommand() error = %q, want exit code", err)
	}
	if !strings.Contains(err.Error(), "stderr detail") {
		t.Fatalf("RunGuestCommand() error = %q, want stderr snippet", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if got := execCommandPayload; len(got) != 5 || got[0] != "sed" || got[4] != "/config/script" {
		t.Fatalf("command payload = %#v", got)
	}
	if statusRequests < 2 {
		t.Fatalf("expected polling exec-status, got %d request(s)", statusRequests)
	}
}
