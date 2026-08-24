package middleware

import (
	"bytes"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var healthRoutes = map[string]struct{}{
	"/api/v1/health": {},
	"/api/v1/ready":  {},
}

func isHealthRoute(route string) bool {
	_, ok := healthRoutes[route]
	return ok
}

func normalizedRoute(c *gin.Context) string {
	route := c.FullPath()
	if route == "" && c.Request != nil && c.Request.URL != nil {
		route = c.Request.URL.Path
	}
	return route
}

// RequestLogger emits one structured completion record per request.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		route := normalizedRoute(c)
		if isHealthRoute(route) {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		duration := time.Since(start)
		ctx := c.Request.Context()
		attrs := []any{
			slog.String("http.method", c.Request.Method),
			slog.String("http.route", route),
			slog.Int("http.status_code", status),
			slog.Duration("http.server.duration", duration),
		}

		switch {
		case status >= 500:
			slog.ErrorContext(ctx, "request completed", attrs...)
		case status >= 400:
			slog.WarnContext(ctx, "request completed", attrs...)
		default:
			slog.InfoContext(ctx, "request completed", attrs...)
		}
	}
}

// SafeRecovery returns a generic 500 without leaking request or panic details.
func SafeRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				route := normalizedRoute(c)
				ctx := c.Request.Context()
				span := trace.SpanFromContext(ctx)
				span.RecordError(fmt.Errorf("panic recovered"))
				span.SetStatus(codes.Error, "panic recovered")
				span.AddEvent("exception", trace.WithAttributes(
					attribute.String("exception.type", "panic"),
					attribute.String("exception.stacktrace", string(debug.Stack())),
				))
				slog.ErrorContext(ctx, "panic recovered",
					slog.String("http.method", c.Request.Method),
					slog.String("http.route", route),
				)
				if !c.Writer.Written() {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
				}
			}
		}()
		c.Next()
	}
}

// SetEndUserID attaches the authenticated principal UUID to the active span.
func SetEndUserID(c *gin.Context, principalID string) {
	trace.SpanFromContext(c.Request.Context()).SetAttributes(
		attribute.String("enduser.id", principalID),
	)
}

// ResponseWriterBuffer wraps gin.ResponseWriter to capture status for tests.
type ResponseWriterBuffer struct {
	gin.ResponseWriter
	body       bytes.Buffer
	statusCode int
}

func (w *ResponseWriterBuffer) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

func (w *ResponseWriterBuffer) WriteString(s string) (int, error) {
	w.body.WriteString(s)
	return w.ResponseWriter.WriteString(s)
}

func (w *ResponseWriterBuffer) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *ResponseWriterBuffer) Status() int {
	if w.statusCode == 0 {
		return http.StatusOK
	}
	return w.statusCode
}

func (w *ResponseWriterBuffer) BodyString() string {
	return strings.TrimSpace(w.body.String())
}
