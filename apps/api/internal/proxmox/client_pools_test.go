package proxmox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeletePoolsSkipsMissingPools(t *testing.T) {
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != http.MethodGet || r.URL.Path != "/api2/json/pools" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
		writeAPIResponse(t, w, http.StatusOK, []Pool{})
	}))
	defer server.Close()

	if err := NewHTTPTestClient(server).DeletePools(context.Background(), []string{"missing-pool"}); err != nil {
		t.Fatalf("DeletePools() error = %v", err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
}
