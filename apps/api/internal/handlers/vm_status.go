package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

type VMStatusHandler struct {
	PX *proxmox.Client
}

// GetStatuses returns a map of vmid -> status directly from Proxmox.
// GET /api/v1/vms/status
func (h *VMStatusHandler) GetStatuses(c *gin.Context) {
	vms, err := h.PX.GetVMs(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch VM statuses"})
		return
	}

	statuses := make(map[int]string, len(vms))
	for _, vm := range vms {
		statuses[vm.VMID] = vm.Status
	}

	c.JSON(http.StatusOK, statuses)
}
