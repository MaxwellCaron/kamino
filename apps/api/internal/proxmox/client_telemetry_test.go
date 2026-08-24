package proxmox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestNormalizeProxmoxPath(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"/api2/json/nodes/pve1/qemu/101/status?ticket=secret", "/api2/json/nodes/{node}/{guestType}/{vmid}/status"},
		{"/api2/json/nodes/pve1/lxc/200/snapshot/snap1", "/api2/json/nodes/{node}/{guestType}/{vmid}/snapshot/{snapshot}"},
	}
	for _, tt := range tests {
		if got := normalizeProxmoxPath(tt.in); got != tt.want {
			t.Fatalf("normalizeProxmoxPath(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestOtelTransportRedactsIdentifiers(t *testing.T) {
	exporter := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(tp)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	base := &http.Transport{}
	rt := wrapTransport(base, server.URL)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL+"/api2/json/nodes/pve1/qemu/101/status?ticket=secret", nil)
	_, _ = rt.RoundTrip(req)

	spans := exporter.GetSpans()
	if len(spans) == 0 {
		t.Fatal("expected client span")
	}
	for _, attr := range spans[0].Attributes {
		val := attr.Value.AsString()
		if val == "secret" || val == "101" || val == "pve1" {
			t.Fatalf("forbidden attribute value %q on key %s", val, attr.Key)
		}
	}
}
