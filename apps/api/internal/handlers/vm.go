package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
	PX       *proxmox.Client
	Service  *inventory.Service
	Notifier *vmstatus.Notifier
}

// GetStatuses returns a map of vmid -> status directly from Proxmox.
// GET /api/v1/vms/status
func (h *VMHandler) GetStatuses(c *gin.Context) {
	if h.Notifier != nil {
		c.JSON(http.StatusOK, h.Notifier.Current())
		return
	}

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

func (h *VMHandler) waitForObservedVMStatus(vmid int, expectedStatus string) {
	if h.Notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := h.Notifier.RefreshUntilStatus(ctx, vmid, expectedStatus); err != nil {
		log.Printf(
			"vm status catch-up failed for vmid=%d expected=%s: %v",
			vmid,
			expectedStatus,
			err,
		)
	}
}

func (h *VMHandler) waitForVMRemoval(vmid int) {
	if h.Notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := h.Notifier.RefreshUntilAbsent(ctx, vmid); err != nil {
		log.Printf("vm removal catch-up failed for vmid=%d: %v", vmid, err)
	}
}

// StreamEvents pushes VM status updates to connected browsers.
// GET /api/v1/vms/events
func (h *VMHandler) StreamEvents(c *gin.Context) {
	if h.Notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm events unavailable"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}

	events, unsubscribe := h.Notifier.Subscribe()
	defer unsubscribe()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	fmt.Fprint(c.Writer, ": vm status stream connected\n\n")
	flusher.Flush()

	initialPayload, err := json.Marshal(vmstatus.Event{
		Type:      "vm.statuses.changed",
		Statuses:  h.Notifier.Current(),
		Timestamp: time.Now().UTC(),
	})
	if err == nil {
		fmt.Fprint(c.Writer, "event: vm.statuses.changed\n")
		fmt.Fprintf(c.Writer, "data: %s\n\n", initialPayload)
		flusher.Flush()
	}

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}

			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}

			fmt.Fprintf(c.Writer, "event: %s\n", event.Type)
			fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

type createSnapshotRequest struct {
	Node        string `json:"node" binding:"required"`
	VMID        int    `json:"vmid" binding:"required"`
	Snapname    string `json:"snapname" binding:"required"`
	Description string `json:"description"`
	VMState     bool   `json:"vmstate"`
}

// CreateSnapshot creates a snapshot of a VM and waits for the Proxmox task to complete.
// POST /api/v1/vms/snapshot
func (h *VMHandler) CreateSnapshot(c *gin.Context) {
	var req createSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.PX.CreateSnapshot(c.Request.Context(), req.Node, req.VMID, req.Snapname, req.Description, req.VMState); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type powerActionRequest struct {
	Node   string `json:"node" binding:"required"`
	VMID   int    `json:"vmid" binding:"required"`
	Action string `json:"action" binding:"required,oneof=start shutdown reboot stop"`
}

// PowerAction performs a power action (start, shutdown, reboot, stop) on a VM
// and waits for the Proxmox task to complete.
// POST /api/v1/vms/power
func (h *VMHandler) PowerAction(c *gin.Context) {
	var req powerActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	var err error

	switch req.Action {
	case "start":
		err = h.PX.StartVM(ctx, req.Node, req.VMID)
	case "shutdown":
		err = h.PX.ShutdownVM(ctx, req.Node, req.VMID)
	case "reboot":
		err = h.PX.RebootVM(ctx, req.Node, req.VMID)
	case "stop":
		err = h.PX.StopVM(ctx, req.Node, req.VMID)
	}

	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	switch req.Action {
	case "start", "reboot":
		h.waitForObservedVMStatus(req.VMID, "running")
	case "shutdown", "stop":
		h.waitForObservedVMStatus(req.VMID, "stopped")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteVM deletes a VM from Proxmox (waits for the task to complete) and
// removes it from the inventory.
// DELETE /api/v1/vms/:node/:vmid
func (h *VMHandler) DeleteVM(c *gin.Context) {
	node := c.Param("node")
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.DeleteVM(ctx, node, vmid); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	if err := h.Service.DeleteInventoryItemByProxmoxVM(ctx, node, int32(vmid)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "VM deleted from Proxmox but failed to remove from inventory"})
		return
	}

	h.waitForVMRemoval(vmid)
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.RenameVM(ctx, req.Node, req.VMID, req.Name); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to rename VM"})
		return
	}

	_ = h.Service.UpdateInventoryItemNameByProxmoxVM(ctx, req.Node, int32(req.VMID), req.Name)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type cloneVMRequest struct {
	Node           string `json:"node" binding:"required"`
	VMID           int    `json:"vmid" binding:"required"`
	NewID          int    `json:"newid"`
	Name           string `json:"name" binding:"required"`
	Full           bool   `json:"full"`
	Target         string `json:"target"`
	TargetFolderID string `json:"target_folder_id" binding:"required"`
}

// CloneVM clones a VM and waits for the Proxmox task to complete.
// POST /api/v1/vms/clone
func (h *VMHandler) CloneVM(c *gin.Context) {
	var req cloneVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	targetFolderID, err := uuid.Parse(req.TargetFolderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target_folder_id"})
		return
	}

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	targetNode := strings.TrimSpace(req.Target)
	if targetNode == "" {
		targetNode = req.Node
	}

	newID := req.NewID
	if newID <= 0 {
		nextID, err := h.PX.GetNextVMID(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch next VMID"})
			return
		}
		newID = nextID
	}

	available, err := h.PX.IsVMIDAvailable(c.Request.Context(), newID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to validate VMID"})
		return
	}
	if !available {
		c.JSON(http.StatusConflict, gin.H{"error": "VM ID is already in use"})
		return
	}

	if err := h.PX.CloneVM(c.Request.Context(), req.Node, req.VMID, newID, req.Name, req.Full, targetNode); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	if err := h.PX.SyncVMPoolMembership(c.Request.Context(), targetNode, newID, placement.PoolID, placement.Path); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	if err := h.Service.RegisterProxmoxVM(
		c.Request.Context(),
		placement.FolderID,
		targetNode,
		int32(newID),
		req.Name,
		false,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "vm cloned in Proxmox but failed to update inventory"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "vmid": newID})
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

	_ = h.Service.UpdateProxmoxVMIsTemplate(ctx, req.Node, int32(req.VMID))

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

// RollbackSnapshot rolls back a VM to a snapshot and waits for the Proxmox task to complete.
// POST /api/v1/vms/snapshot/rollback
func (h *VMHandler) RollbackSnapshot(c *gin.Context) {
	var req rollbackSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.PX.RollbackSnapshot(c.Request.Context(), req.Node, req.VMID, req.Snapname); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteSnapshot deletes a VM snapshot and waits for the Proxmox task to complete.
// DELETE /api/v1/vms/:node/:vmid/snapshots/:snapname
func (h *VMHandler) DeleteSnapshot(c *gin.Context) {
	node := c.Param("node")
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}
	snapname := c.Param("snapname")

	if err := h.PX.DeleteSnapshot(c.Request.Context(), node, vmid, snapname); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
