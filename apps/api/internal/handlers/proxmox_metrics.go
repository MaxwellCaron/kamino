package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

type clusterUsageHistoryResponse struct {
	Points []proxmox.ClusterUsageHistoryPoint `json:"points"`
}

// GetClusterUsageHistory returns aggregate cluster usage history sourced
// directly from Proxmox RRD data.
// GET /api/v1/proxmox/cluster/usage-history
func (h *VMCreateHandler) GetClusterUsageHistory(c *gin.Context) {
	points, err := h.PX.GetClusterUsageHistory(
		c.Request.Context(),
		c.DefaultQuery("timeframe", string(proxmox.ClusterUsageTimeframeHour)),
	)
	if err != nil {
		writeLoggedError(
			c,
			http.StatusBadGateway,
			"failed to fetch cluster usage history",
			"fetch proxmox cluster usage history",
			err,
		)
		return
	}

	c.JSON(http.StatusOK, clusterUsageHistoryResponse{Points: points})
}
