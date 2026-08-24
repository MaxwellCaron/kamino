package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestLoggedError500RecordsSpanError(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	exporter := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(tp)

	w := httptest.NewRecorder()
	c, r := gin.CreateTestContext(w)
	r.GET("/api/v1/test", func(ctx *gin.Context) {})
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/test", nil)
	c.Set("path", "/api/v1/test")
	ctx, span := tp.Tracer("test").Start(c.Request.Context(), "handler")
	c.Request = c.Request.WithContext(ctx)

	writeLoggedError(c, http.StatusInternalServerError, "internal server error", "test op", errTest)
	span.End()

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", w.Code)
	}
	spans := exporter.GetSpans()
	if len(spans) == 0 || spans[0].Status.Code != codes.Error {
		t.Fatal("expected error status on span for 500")
	}
}

func TestLoggedError400DoesNotMarkSpanError(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	exporter := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(tp)

	w := httptest.NewRecorder()
	c, r := gin.CreateTestContext(w)
	r.GET("/api/v1/test", func(ctx *gin.Context) {})
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/test", nil)
	ctx, span := tp.Tracer("test").Start(c.Request.Context(), "handler")
	c.Request = c.Request.WithContext(ctx)

	writeLoggedError(c, http.StatusBadRequest, "invalid request", "validate", errTest)
	span.End()

	spans := exporter.GetSpans()
	if len(spans) > 0 && spans[0].Status.Code == codes.Error {
		t.Fatal("400 should not set span error status")
	}
}

var errTest = &testError{"boom"}

type testError struct{ msg string }

func (e *testError) Error() string { return e.msg }
