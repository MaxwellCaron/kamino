package proxmoxadmin

import (
	"context"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GetClusterUsageHistory returns aggregate cluster usage history sourced
// directly from Proxmox RRD data.
// GET /api/v1/proxmox/cluster/usage-history
func (h *MetricsHandler) GetClusterUsageHistory(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator) {
		return
	}

	history, err := h.PX.GetClusterUsageHistory(
		c.Request.Context(),
		c.DefaultQuery("timeframe", string(proxmox.ClusterUsageTimeframeHour)),
	)
	if err != nil {
		httpx.WriteLoggedError(
			c,
			http.StatusBadGateway,
			"failed to fetch cluster usage history",
			"fetch proxmox cluster usage history",
			err,
		)
		return
	}

	c.JSON(http.StatusOK, history)
}

type MetricsHandler struct {
	PX    clusterUsageReader
	Authz managementAuthorizer
}

type clusterUsageReader interface {
	GetClusterUsageHistory(context.Context, string) (proxmox.ClusterUsageHistory, error)
}

type managementAuthorizer interface {
	RequireManagement(context.Context, uuid.UUID, authorization.ManagementPermission) error
}
