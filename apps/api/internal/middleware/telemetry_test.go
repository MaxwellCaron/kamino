package middleware

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestRequestLoggerNormalizedRoute(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	var buf bytes.Buffer
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))

	r := gin.New()
	r.Use(RequestLogger())
	r.GET("/api/v1/inventory/items/:id", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/inventory/items/550e8400-e29b-41d4-a716-446655440000", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if !bytes.Contains(buf.Bytes(), []byte(`"/api/v1/inventory/items/:id"`)) {
		t.Fatalf("expected normalized route in logs, got %s", buf.String())
	}
	if bytes.Contains(buf.Bytes(), []byte("550e8400")) {
		t.Fatalf("raw uuid must not appear in logs: %s", buf.String())
	}
}

func TestRequestLoggerSkipsHealth(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	var buf bytes.Buffer
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))

	r := gin.New()
	r.Use(RequestLogger())
	r.GET("/api/v1/health", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if buf.Len() != 0 {
		t.Fatalf("health route should not be logged, got %s", buf.String())
	}
}

func TestSafeRecoveryDoesNotLeakPanic(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	exporter := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(tp)

	r := gin.New()
	r.Use(SafeRecovery())
	r.GET("/panic", func(c *gin.Context) {
		ctx, span := tp.Tracer("test").Start(c.Request.Context(), "panic-route")
		c.Request = c.Request.WithContext(ctx)
		_ = span
		panic("secret-token must-not-appear")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("secret-token")) {
		t.Fatalf("panic value leaked into response: %s", rec.Body.String())
	}
}

func TestSetEndUserID(t *testing.T) {
	exporter := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(tp)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	ctx, span := tp.Tracer("test").Start(context.Background(), "auth")
	defer span.End()
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)

	SetEndUserID(c, "550e8400-e29b-41d4-a716-446655440000")
	span.End()

	spans := exporter.GetSpans()
	if len(spans) == 0 {
		t.Fatal("expected span")
	}
	found := false
	for _, attr := range spans[0].Attributes {
		if string(attr.Key) == "enduser.id" && attr.Value.AsString() == "550e8400-e29b-41d4-a716-446655440000" {
			found = true
		}
	}
	if !found {
		t.Fatal("enduser.id not set on span")
	}
}
