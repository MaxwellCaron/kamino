package proxmoxsync

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
)

func TestImportVMConfigErrorsAreReadOnlyAndImmediate(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"forbidden", 403, `{"message":"permission denied"}`, "403"},
		{"unavailable", 500, `{"message":"node unavailable"}`, "node unavailable"},
		{"missing identity", 200, `{"data":{"name":"VM 334"}}`, proxmox.ErrVMIdentityNotConfigured.Error()},
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
			importer := NewInventoryImporter(nil, proxmox.NewHTTPTestClient(server))
			err := importer.importVM(context.Background(), uuid.New(), "node1", 334, proxmox.GuestQEMU)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("unexpected error: %v", err)
			}
			if errors.Is(err, context.DeadlineExceeded) || calls != 1 {
				t.Fatalf("retried a config error: calls=%d, err=%v", calls, err)
			}
		})
	}
}
