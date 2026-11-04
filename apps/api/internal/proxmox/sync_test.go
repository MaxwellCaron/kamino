package proxmox

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWaitForVMConfigSummaryPreservesConfigError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "config is unavailable on this node", http.StatusForbidden)
	}))
	defer server.Close()
	importer := NewInventoryImporter(nil, NewHTTPTestClient(server))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := importer.waitForVMConfigSummary(ctx, GuestQEMU, "node1", 334)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline error, got %v", err)
	}
	for _, detail := range []string{"334", "node1", "403", "config is unavailable on this node"} {
		if !strings.Contains(err.Error(), detail) {
			t.Errorf("error %q missing %q", err, detail)
		}
	}
}
