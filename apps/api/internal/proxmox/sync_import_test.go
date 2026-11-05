package proxmox

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestInventorySummaryDoesNotRequireEditableDisk(t *testing.T) {
	for _, tc := range []struct {
		name string
		disk string
		want *float64
	}{
		{"diskless", "", new(float64(0))},
		{"normal", "local:vm-334-disk-0,size=8G", new(float64(8))},
		{"size unavailable", "local:vm-334-disk-0", nil},
		{"passthrough", "/dev/disk/by-id/example", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := map[string]any{"smbios1": "uuid=" + uuid.NewString()}
			if tc.disk != "" {
				data["scsi0"] = tc.disk
			}
			got, err := parseVMConfigSummary(data, 334)
			if err != nil {
				t.Fatal(err)
			}
			if got.Name != "VM 334" {
				t.Fatalf("unexpected name: %s", got.Name)
			}
			if (got.DiskGB == nil) != (tc.want == nil) || (tc.want != nil && *got.DiskGB != *tc.want) {
				t.Fatalf("unexpected disk size: %v", got.DiskGB)
			}
			if tc.name == "diskless" {
				if _, err := parseVMHardwareConfig(data); err == nil {
					t.Fatal("hardware editor should still reject missing editable disk")
				}
			}
		})
	}
}

func TestImportVMConfigErrorsAreReadOnlyAndImmediate(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"forbidden", 403, `{"message":"permission denied"}`, "403"},
		{"unavailable", 500, `{"message":"node unavailable"}`, "node unavailable"},
		{"missing identity", 200, `{"data":{"name":"VM 334"}}`, ErrVMIdentityNotConfigured.Error()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != http.MethodGet {
					t.Errorf("import attempted %s", r.Method)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			importer := NewInventoryImporter(nil, NewHTTPTestClient(server))
			err := importer.importVM(context.Background(), uuid.New(), "node1", 334, GuestQEMU)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("unexpected error: %v", err)
			}
			if errors.Is(err, context.DeadlineExceeded) || calls != 1 {
				t.Fatalf("retried a config error: calls=%d, err=%v", calls, err)
			}
		})
	}
}
