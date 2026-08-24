// Convention: handlers never call c.JSON(status, gin.H{"error": ...}) directly.
// - failures with an underlying err  -> writeLoggedError (logs, then responds)
// - validation 400s                  -> writeInvalidRequest
// - permission 403s                  -> writeForbidden
// - missing/invalid auth 401s        -> writeUnauthorized
// Response bodies are static strings; internal error text goes to logs only.
package handlers

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

func normalizedRoute(c *gin.Context) string {
	path := c.FullPath()
	if path == "" && c.Request != nil && c.Request.URL != nil {
		path = c.Request.URL.Path
	}
	return path
}

func logRequestError(c *gin.Context, operation string, err error) {
	status := c.Writer.Status()
	if status == 0 {
		status = http.StatusInternalServerError
	}
	logRequestErrorWithStatus(c, status, operation, err)
}

func logRequestErrorWithStatus(c *gin.Context, status int, operation string, err error) {
	if err == nil {
		return
	}

	ctx := c.Request.Context()
	attrs := []any{
		slog.String("operation", operation),
		slog.String("http.method", c.Request.Method),
		slog.String("http.route", normalizedRoute(c)),
		slog.Int("http.status_code", status),
		slog.String("error", err.Error()),
	}

	span := trace.SpanFromContext(ctx)
	if status >= 500 {
		span.RecordError(err)
		span.SetStatus(codes.Error, operation)
		slog.ErrorContext(ctx, "api request failed", attrs...)
		return
	}
	slog.WarnContext(ctx, "api request failed", attrs...)
}

func writeLoggedError(
	c *gin.Context,
	status int,
	userMessage string,
	operation string,
	err error,
) {
	logRequestErrorWithStatus(c, status, operation, err)
	c.JSON(status, gin.H{"error": userMessage})
}

func writeInvalidRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": message})
}

func writeForbidden(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

func writeUnauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
}

func writeConflict(c *gin.Context, message string) {
	c.JSON(http.StatusConflict, gin.H{"error": message})
}
