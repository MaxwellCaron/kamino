package proxmox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVMStorageReady(t *testing.T) {
	tests := []struct {
		name       string
		handler    http.HandlerFunc
		wantReady  bool
		wantErr    bool
		errMessage string
	}{
		{
			name: "ready content",
			handler: func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
					writeAPIResponse(t, w, http.StatusOK, map[string]any{
						"scsi0": "local-lvm:vm-101-disk-0,size=10G",
					})
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/storage/local-lvm/content":
					writeAPIResponse(t, w, http.StatusOK, []StorageContent{{
						VolID: "local-lvm:vm-101-disk-0",
						Size:  1024,
					}})
				default:
					t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
			},
			wantReady: true,
		},
		{
			name: "empty content list",
			handler: func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
					writeAPIResponse(t, w, http.StatusOK, map[string]any{
						"scsi0": "local-lvm:vm-101-disk-0,size=10G",
					})
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/storage/local-lvm/content":
					writeAPIResponse(t, w, http.StatusOK, []StorageContent{})
				default:
					t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
			},
			wantReady: false,
		},
		{
			name: "missing primary disk",
			handler: func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config" {
					writeAPIResponse(t, w, http.StatusOK, map[string]any{
						"name": "router",
					})
					return
				}
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
			},
			wantErr:    true,
			errMessage: "parsing VM 101 disk config",
		},
		{
			name: "storage API failure",
			handler: func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
					writeAPIResponse(t, w, http.StatusOK, map[string]any{
						"scsi0": "local-lvm:vm-101-disk-0,size=10G",
					})
				case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/storage/local-lvm/content":
					w.WriteHeader(http.StatusInternalServerError)
				default:
					t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
			},
			wantErr:    true,
			errMessage: "fetching VM 101 storage content",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(tt.handler)
			defer server.Close()

			client := newTestClient(server)
			ready, err := client.VMStorageReady(context.Background(), "node1", 101)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errMessage != "" && !strings.Contains(err.Error(), tt.errMessage) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.errMessage)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ready != tt.wantReady {
				t.Fatalf("ready = %v, want %v", ready, tt.wantReady)
			}
		})
	}
}

func TestWaitForVMStorageReady(t *testing.T) {
	t.Run("not ready times out", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config":
				writeAPIResponse(t, w, http.StatusOK, map[string]any{
					"scsi0": "local-lvm:vm-101-disk-0,size=10G",
				})
			case r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/storage/local-lvm/content":
				writeAPIResponse(t, w, http.StatusOK, []StorageContent{})
			default:
				t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
			}
		}))
		defer server.Close()

		client := newTestClient(server)
		err := client.WaitForVMStorageReady(context.Background(), "node1", 101, 50*time.Millisecond)
		if err == nil {
			t.Fatal("expected timeout error")
		}
		if !strings.Contains(err.Error(), "waiting for VM storage readiness") {
			t.Fatalf("error %q does not mention storage readiness timeout", err.Error())
		}
	})

	t.Run("API error returns without polling until timeout", func(t *testing.T) {
		requests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests++
			if r.Method == http.MethodGet && r.URL.Path == "/api2/json/nodes/node1/qemu/101/config" {
				w.WriteHeader(http.StatusBadGateway)
				return
			}
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}))
		defer server.Close()

		client := newTestClient(server)
		err := client.WaitForVMStorageReady(context.Background(), "node1", 101, time.Second)
		if err == nil {
			t.Fatal("expected API error")
		}
		if !strings.Contains(err.Error(), "fetching VM 101 config on node node1") {
			t.Fatalf("error %q does not mention config fetch failure", err.Error())
		}
		if requests != 1 {
			t.Fatalf("requests = %d, want 1", requests)
		}
	})
}

func TestParseSizeToGB(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    int
		wantErr bool
	}{
		{
			name:  "gigabytes",
			input: "32G",
			want:  32,
		},
		{
			name:  "terabytes",
			input: "8T",
			want:  8192,
		},
		{
			name:  "megabytes round up",
			input: "512M",
			want:  1,
		},
		{
			name:  "kilobytes round up",
			input: "1024K",
			want:  1,
		},
		{
			name:  "unitless bytes exact gibibytes",
			input: "34359738368",
			want:  32,
		},
		{
			name:  "unitless bytes round up",
			input: "34359738369",
			want:  33,
		},
		{
			name:  "small unitless bytes round up",
			input: "4194304",
			want:  1,
		},
		{
			name:  "lowercase suffix",
			input: "32g",
			want:  32,
		},
		{
			name:    "empty",
			input:   "",
			wantErr: true,
		},
		{
			name:    "invalid",
			input:   "abcG",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSizeToGB(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("parseSizeToGB(%q) expected error", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseSizeToGB(%q) unexpected error: %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("parseSizeToGB(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}

	got, err := parseSizeToGB("34359738368")
	if err != nil {
		t.Fatalf("parseSizeToGB regression guard unexpected error: %v", err)
	}
	if got != 32 {
		t.Fatalf("parseSizeToGB regression guard = %d, want 32", got)
	}
}
