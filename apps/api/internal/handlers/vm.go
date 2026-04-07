package handlers

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func parseIntParam(c *gin.Context, name string) (int, error) {
	val, err := strconv.Atoi(c.Param(name))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + name})
	}
	return val, err
}

// VMHandler handles all VM-related API endpoints (status, power, snapshots, etc.).
type VMHandler struct {
	PX *proxmox.Client
	DB *pgxpool.Pool
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

type powerActionRequest struct {
	Node   string `json:"node" binding:"required"`
	VMID   int    `json:"vmid" binding:"required"`
	Action string `json:"action" binding:"required,oneof=start shutdown reboot stop"`
}

// PowerAction performs a power action (start, shutdown, reboot, stop) on a VM.
// POST /api/v1/vms/power
func (h *VMHandler) PowerAction(c *gin.Context) {
	var req powerActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	var taskID string
	var err error

	switch req.Action {
	case "start":
		taskID, err = h.PX.StartVM(ctx, req.Node, req.VMID)
	case "shutdown":
		taskID, err = h.PX.ShutdownVM(ctx, req.Node, req.VMID)
	case "reboot":
		taskID, err = h.PX.RebootVM(ctx, req.Node, req.VMID)
	case "stop":
		taskID, err = h.PX.StopVM(ctx, req.Node, req.VMID)
	}

	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to " + req.Action + " VM"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}

// DeleteVM deletes a VM from Proxmox and removes it from the inventory.
// DELETE /api/v1/vms/:node/:vmid
func (h *VMHandler) DeleteVM(c *gin.Context) {
	node := c.Param("node")
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}

	ctx := c.Request.Context()

	taskID, err := h.PX.DeleteVM(ctx, node, vmid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to delete VM from Proxmox"})
		return
	}

	queries := database.New(h.DB)
	if err := queries.DeleteInventoryItemByProxmoxVM(ctx, database.DeleteInventoryItemByProxmoxVMParams{
		Node: node,
		Vmid: int32(vmid),
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "VM deleted from Proxmox but failed to remove from inventory"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}

type renameVMRequest struct {
	Node string `json:"node" binding:"required"`
	VMID int    `json:"vmid" binding:"required"`
	Name string `json:"name" binding:"required"`
}

// RenameVM renames a VM in Proxmox and updates the inventory.
// POST /api/v1/vms/rename
func (h *VMHandler) RenameVM(c *gin.Context) {
	var req renameVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.RenameVM(ctx, req.Node, req.VMID, req.Name); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to rename VM"})
		return
	}

	queries := database.New(h.DB)
	_ = queries.UpdateInventoryItemNameByProxmoxVM(ctx, database.UpdateInventoryItemNameByProxmoxVMParams{
		Name: req.Name,
		Node: req.Node,
		Vmid: int32(req.VMID),
	})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type cloneVMRequest struct {
	Node  string `json:"node" binding:"required"`
	VMID  int    `json:"vmid" binding:"required"`
	NewID int    `json:"newid" binding:"required"`
	Name  string `json:"name" binding:"required"`
	Full  bool   `json:"full"`
}

// CloneVM clones a VM in Proxmox.
// POST /api/v1/vms/clone
func (h *VMHandler) CloneVM(c *gin.Context) {
	var req cloneVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	taskID, err := h.PX.CloneVM(c.Request.Context(), req.Node, req.VMID, req.NewID, req.Name, req.Full)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to clone VM"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}

type convertToTemplateRequest struct {
	Node string `json:"node" binding:"required"`
	VMID int    `json:"vmid" binding:"required"`
}

// ConvertToTemplate converts a VM to a template.
// POST /api/v1/vms/template
func (h *VMHandler) ConvertToTemplate(c *gin.Context) {
	var req convertToTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.ConvertToTemplate(ctx, req.Node, req.VMID); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to convert to template"})
		return
	}

	queries := database.New(h.DB)
	_ = queries.UpdateProxmoxVMIsTemplate(ctx, database.UpdateProxmoxVMIsTemplateParams{
		Node: req.Node,
		Vmid: int32(req.VMID),
	})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetSnapshots returns all snapshots for a VM.
// GET /api/v1/vms/:node/:vmid/snapshots
func (h *VMHandler) GetSnapshots(c *gin.Context) {
	node := c.Param("node")
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}

	snapshots, err := h.PX.GetSnapshots(c.Request.Context(), node, vmid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch snapshots"})
		return
	}

	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Snaptime < snapshots[j].Snaptime
	})

	c.JSON(http.StatusOK, snapshots)
}

type rollbackSnapshotRequest struct {
	Node     string `json:"node" binding:"required"`
	VMID     int    `json:"vmid" binding:"required"`
	Snapname string `json:"snapname" binding:"required"`
}

// RollbackSnapshot rolls back a VM to a snapshot.
// POST /api/v1/vms/snapshot/rollback
func (h *VMHandler) RollbackSnapshot(c *gin.Context) {
	var req rollbackSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	taskID, err := h.PX.RollbackSnapshot(c.Request.Context(), req.Node, req.VMID, req.Snapname)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to rollback snapshot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}

// DeleteSnapshot deletes a VM snapshot.
// DELETE /api/v1/vms/:node/:vmid/snapshots/:snapname
func (h *VMHandler) DeleteSnapshot(c *gin.Context) {
	node := c.Param("node")
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}
	snapname := c.Param("snapname")

	taskID, err := h.PX.DeleteSnapshot(c.Request.Context(), node, vmid, snapname)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to delete snapshot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}
