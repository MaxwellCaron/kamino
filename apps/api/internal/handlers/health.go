package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const readinessTimeout = 2 * time.Second

// DatabasePinger is the narrow database seam used for readiness checks.
type DatabasePinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler serves process liveness and database readiness endpoints.
type HealthHandler struct {
	DB DatabasePinger
}

func (h *HealthHandler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), readinessTimeout)
	defer cancel()

	if err := h.DB.Ping(ctx); err != nil {
		logRequestError(c, "readiness", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not_ready"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}
