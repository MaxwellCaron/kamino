package vyos

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

func writeResponse(t *testing.T, w http.ResponseWriter, status int, body map[string]any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func newTestClient(t *testing.T, server *httptest.Server) *Client {
	t.Helper()

	client, err := NewClient(server.URL, "shared-key", true)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	return client
}

func TestConfigureSendsKeyAndJSONData(t *testing.T) {
	var (
		requestPath string
		keyValue    string
		dataValue   string
	)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}

		requestPath = r.URL.Path
		keyValue = r.PostForm.Get("key")
		dataValue = r.PostForm.Get("data")
		writeResponse(t, w, http.StatusOK, map[string]any{
			"success": true,
			"data":    nil,
			"error":   nil,
		})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	err := client.Configure(context.Background(), ConfigureOperation{
		Op:   "set",
		Path: []string{"interfaces", "ethernet", "eth0", "address", "172.16.24.1/24"},
	})
	if err != nil {
		t.Fatalf("Configure() error = %v", err)
	}

	if requestPath != "/configure" {
		t.Fatalf("path = %q, want %q", requestPath, "/configure")
	}
	if keyValue != "shared-key" {
		t.Fatalf("key = %q, want %q", keyValue, "shared-key")
	}
	var operation ConfigureOperation
	if err := json.Unmarshal([]byte(dataValue), &operation); err != nil {
		t.Fatalf("Unmarshal(data) error = %v", err)
	}
	if operation.Op != "set" {
		t.Fatalf("operation.Op = %q, want %q", operation.Op, "set")
	}
	if strings.Join(operation.Path, "/") != "interfaces/ethernet/eth0/address/172.16.24.1/24" {
		t.Fatalf("operation.Path = %#v", operation.Path)
	}
}

func TestWaitForReadyRetriesUntilSuccess(t *testing.T) {
	var mu sync.Mutex
	requests := 0

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/retrieve" {
			t.Fatalf("path = %q, want %q", r.URL.Path, "/retrieve")
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}

		var payload map[string]any
		if err := json.Unmarshal([]byte(r.PostForm.Get("data")), &payload); err != nil {
			t.Fatalf("Unmarshal(data) error = %v", err)
		}
		if payload["op"] != "showConfig" {
			t.Fatalf("payload op = %#v, want %q", payload["op"], "showConfig")
		}

		mu.Lock()
		requests++
		current := requests
		mu.Unlock()

		if current < 3 {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		writeResponse(t, w, http.StatusOK, map[string]any{
			"success": true,
			"data":    map[string]any{},
			"error":   nil,
		})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	if err := client.WaitForReady(context.Background(), 3*time.Second); err != nil {
		t.Fatalf("WaitForReady() error = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if requests < 3 {
		t.Fatalf("requests = %d, want at least 3", requests)
	}
}

func TestConfigureSurfacesAPIErrors(t *testing.T) {
	tests := []struct {
		name string
		body map[string]any
		want string
	}{
		{
			name: "success false",
			body: map[string]any{
				"success": false,
				"data":    nil,
				"error":   "commit failed",
			},
			want: "commit failed",
		},
		{
			name: "non-empty error",
			body: map[string]any{
				"success": true,
				"data":    nil,
				"error":   "config lock held",
			},
			want: "config lock held",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				writeResponse(t, w, http.StatusOK, tt.body)
			}))
			defer server.Close()

			client := newTestClient(t, server)
			err := client.Configure(context.Background(), ConfigureOperation{
				Op:   "delete",
				Path: []string{"nat", "source", "rule", "2000"},
			})
			if err == nil {
				t.Fatalf("Configure() error = nil, want non-nil")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("Configure() error = %q, want substring %q", err, tt.want)
			}
		})
	}
}

func TestSaveUsesConfigFileEndpoint(t *testing.T) {
	var (
		requestPath string
		postForm    url.Values
	)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() error = %v", err)
		}
		requestPath = r.URL.Path
		postForm = r.PostForm
		writeResponse(t, w, http.StatusOK, map[string]any{
			"success": true,
			"data":    "saved",
			"error":   nil,
		})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	if err := client.Save(context.Background()); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	if requestPath != "/config-file" {
		t.Fatalf("path = %q, want %q", requestPath, "/config-file")
	}
	if got := postForm.Get("key"); got != "shared-key" {
		t.Fatalf("key = %q, want %q", got, "shared-key")
	}
	if got := postForm.Get("data"); got != "{\"op\":\"save\"}" {
		t.Fatalf("data = %q, want %q", got, "{\"op\":\"save\"}")
	}
}
