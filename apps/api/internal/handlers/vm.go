package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

// VMHandler handles all VM-related API endpoints (status, power, snapshots, etc.).
type VMHandler struct {
	PX *proxmox.Client
}

// GetStatuses returns a map of vmid -> status directly from Proxmox.
// GET /api/v1/vms/status
func (h *VMHandler) GetStatuses(c *gin.Context) {
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

type createSnapshotRequest struct {
	Node        string `json:"node" binding:"required"`
	VMID        int    `json:"vmid" binding:"required"`
	Snapname    string `json:"snapname" binding:"required"`
	Description string `json:"description"`
	VMState     bool   `json:"vmstate"`
}

// CreateSnapshot creates a snapshot of a VM.
// POST /api/v1/vms/snapshot
func (h *VMHandler) CreateSnapshot(c *gin.Context) {
	var req createSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	taskID, err := h.PX.CreateSnapshot(c.Request.Context(), req.Node, req.VMID, req.Snapname, req.Description, req.VMState)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create snapshot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}
