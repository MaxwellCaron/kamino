package observability

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestNewDisabled(t *testing.T) {
	tel, err := New(context.Background(), Config{Enabled: false})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if tel.Enabled() {
		t.Fatal("expected disabled telemetry")
	}
	if tel.Metrics() == nil || tel.Tracer() == nil || tel.Logger() == nil {
		t.Fatal("expected non-nil noop instruments")
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("second Shutdown() error = %v", err)
	}
}

func TestNewInvalidConfig(t *testing.T) {
	_, err := New(context.Background(), Config{Enabled: true})
	if err == nil {
		t.Fatal("expected error for missing endpoint")
	}

	_, err = New(context.Background(), Config{
		Enabled:          true,
		OTLPEndpoint:     "http://localhost:4318",
		TraceSampleRatio: 2,
	})
	if err == nil {
		t.Fatal("expected error for invalid sample ratio")
	}

	_, err = New(context.Background(), Config{
		Enabled:          true,
		OTLPEndpoint:     "http://localhost:4318",
		TraceSampleRatio: 1,
		DeploymentEnv:    "production",
		K8sClusterName:   clusterNamePlaceholder,
		ServiceVersion:   "test",
	})
	if err == nil {
		t.Fatal("expected error for placeholder cluster name")
	}
}

func TestEnabledResourceAttributes(t *testing.T) {
	cfg := Config{
		Enabled:          true,
		OTLPEndpoint:     "http://127.0.0.1:0/v1/traces",
		TraceSampleRatio: 1,
		DeploymentEnv:    "local",
		ServiceVersion:   "abc123",
		K8sClusterName:   "test-cluster",
		K8sNamespace:     "kamino-dev",
		K8sPodName:       "kamino-api-xyz",
		K8sPodUID:        "uid-123",
	}

	res, err := buildResource(context.Background(), cfg)
	if err != nil {
		t.Fatalf("buildResource() error = %v", err)
	}

	attrs := res.Attributes()
	assertAttr(t, attrs, "service.name", "kamino-api")
	assertAttr(t, attrs, "service.namespace", "kamino")
	assertAttr(t, attrs, "service.version", "abc123")
	assertAttr(t, attrs, "deployment.environment.name", "local")
	assertAttr(t, attrs, "k8s.cluster.name", "test-cluster")
	assertAttr(t, attrs, "k8s.namespace.name", "kamino-dev")
	assertAttr(t, attrs, "k8s.pod.name", "kamino-api-xyz")
	assertAttr(t, attrs, "k8s.pod.uid", "uid-123")

	_ = tracetest.NewInMemoryExporter()
	_ = sdktrace.NewTracerProvider()
	_ = sdkmetric.NewManualReader()
}

func TestLogCorrelation(t *testing.T) {
	tel, err := New(context.Background(), Config{Enabled: false})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	ctx, span := tel.Tracer().Start(context.Background(), "test-span")
	defer span.End()
	tel.Logger().InfoContext(ctx, "correlated")
}

func TestCustomMetricsConstruction(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	meter := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)).Meter("kamino-api")
	metrics, err := newMetrics(meter)
	if err != nil {
		t.Fatalf("newMetrics() error = %v", err)
	}

	ctx := context.Background()
	metrics.SSEConnections.Add(ctx, 1)
	metrics.EventsDelivered.Add(ctx, 1,
		metric.WithAttributes(
			attribute.String("bus", EventBusInventory),
			attribute.String("event.type", "inventory.changed"),
		),
	)

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(ctx, &rm); err != nil {
		t.Fatalf("Collect() error = %v", err)
	}
	if len(rm.ScopeMetrics) == 0 {
		t.Fatal("expected scope metrics")
	}
}

func assertAttr(t *testing.T, attrs []attribute.KeyValue, key, want string) {
	t.Helper()
	for _, attr := range attrs {
		if string(attr.Key) == key {
			if attr.Value.AsString() != want {
				t.Fatalf("attribute %s = %q, want %q", key, attr.Value.AsString(), want)
			}
			return
		}
	}
	t.Fatalf("attribute %s not found", key)
}
