package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type InventoryHandler struct {
	Service  *inventory.Service
	Notifier *inventory.Notifier
	PX       *proxmox.Client
}

// JSON response types

type TreeNode struct {
	ID       uuid.UUID  `json:"id"`
	Name     string     `json:"name"`
	Kind     string     `json:"kind"`
	Children []TreeNode `json:"children,omitempty"`
	VM       *VMDetail  `json:"vm,omitempty"`
}

type VMDetail struct {
	Node       string   `json:"node"`
	VMID       int32    `json:"vmid"`
	IsTemplate bool     `json:"is_template"`
	CPUCount   *int32   `json:"cpu_count,omitempty"`
	MemoryMB   *int32   `json:"memory_mb,omitempty"`
	DiskGB     *float64 `json:"disk_gb,omitempty"`
}

type InventoryItem struct {
	ID                 uuid.UUID  `json:"id"`
	ParentID           *uuid.UUID `json:"parent_id"`
	Kind               string     `json:"kind"`
	Name               string     `json:"name"`
	InheritPermissions bool       `json:"inherit_permissions"`
	VM                 *VMDetail  `json:"vm,omitempty"`
}

// GetTree returns the full inventory tree.
// GET /api/v1/inventory/tree
func (h *InventoryHandler) GetTree(c *gin.Context) {
	rows, err := h.Service.GetAllInventoryItems(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch inventory", "load inventory tree", err)
		return
	}

	c.JSON(http.StatusOK, buildTree(rows))
}

// GetItem returns a single inventory item with VM details.
// GET /api/v1/inventory/items/:id
func (h *InventoryHandler) GetItem(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row, err := h.Service.GetInventoryItemByID(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch item", "load inventory item", err)
		return
	}

	item := InventoryItem{
		ID:                 row.ID,
		ParentID:           row.ParentID,
		Kind:               string(row.Kind),
		Name:               row.Name,
		InheritPermissions: row.InheritPermissions,
	}

	if row.Node != nil {
		item.VM = toVMDetail(row.Node, row.Vmid, row.IsTemplate, row.CpuCount, row.MemoryMb, row.DiskGb)
	}

	c.JSON(http.StatusOK, item)
}

type moveInventoryItemRequest struct {
	ItemID   uuid.UUID `json:"item_id" binding:"required"`
	ParentID uuid.UUID `json:"parent_id" binding:"required"`
}

// MoveItem persists an inventory move initiated from drag and drop.
// POST /api/v1/inventory/move
func (h *InventoryHandler) MoveItem(c *gin.Context) {
	var req moveInventoryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	if err := h.Service.MoveInventoryItem(c.Request.Context(), req.ItemID, req.ParentID); err != nil {
		writeInventoryError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type createFolderRequest struct {
	ParentID uuid.UUID `json:"parent_id" binding:"required"`
	Name     string    `json:"name" binding:"required"`
}

// CreateFolder creates a child folder within the inventory tree.
// POST /api/v1/inventory/folders
func (h *InventoryHandler) CreateFolder(c *gin.Context) {
	var req createFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := h.Service.CreateFolder(c.Request.Context(), req.ParentID, req.Name)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type renameFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

// RenameFolder renames a folder without changing its identity.
// POST /api/v1/inventory/folders/:id/rename
func (h *InventoryHandler) RenameFolder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req renameFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	if err := h.Service.RenameFolder(c.Request.Context(), id, req.Name); err != nil {
		writeInventoryError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteFolder recursively deletes a folder, its embedded Proxmox VMs/templates,
// and the folder subtree from inventory.
// DELETE /api/v1/inventory/folders/:id
func (h *InventoryHandler) DeleteFolder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	plan, err := h.Service.BuildFolderDeletionPlan(c.Request.Context(), id)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	if h.PX == nil && len(plan.ProxmoxVMs) > 0 {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "proxmox client unavailable"})
		return
	}

	for _, vm := range plan.ProxmoxVMs {
		if err := h.PX.DeleteVM(c.Request.Context(), vm.Node, int(vm.VMID)); err != nil {
			logRequestError(c, fmt.Sprintf("delete inventory folder proxmox vmid=%d node=%s", vm.VMID, vm.Node), err)
			kind := "VM"
			if vm.IsTemplate {
				kind = "template"
			}

			c.JSON(http.StatusBadGateway, gin.H{
				"error": fmt.Sprintf("failed to delete %s %q (%d)", kind, vm.Name, vm.VMID),
			})
			return
		}
	}

	if err := h.Service.DeleteFolder(c.Request.Context(), id); err != nil {
		writeInventoryError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// StreamEvents pushes inventory change events to connected browsers.
// GET /api/v1/inventory/events
func (h *InventoryHandler) StreamEvents(c *gin.Context) {
	if h.Notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "inventory events unavailable"})
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

	fmt.Fprint(c.Writer, ": inventory stream connected\n\n")
	flusher.Flush()

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

// buildTree converts a flat list of inventory rows into a nested tree.
func buildTree(rows []database.GetAllInventoryItemsRow) []TreeNode {
	nodes := make(map[uuid.UUID]*TreeNode, len(rows))
	childMap := make(map[uuid.UUID][]uuid.UUID, len(rows))
	var rootIDs []uuid.UUID

	for _, row := range rows {
		node := &TreeNode{
			ID:   row.ID,
			Name: row.Name,
			Kind: string(row.Kind),
		}

		if row.Node != nil {
			node.VM = toVMDetail(row.Node, row.Vmid, row.IsTemplate, row.CpuCount, row.MemoryMb, row.DiskGb)
		}

		nodes[row.ID] = node

		if row.ParentID != nil {
			childMap[*row.ParentID] = append(childMap[*row.ParentID], row.ID)
		} else {
			rootIDs = append(rootIDs, row.ID)
		}
	}

	var assemble func(id uuid.UUID) TreeNode
	assemble = func(id uuid.UUID) TreeNode {
		node := *nodes[id]
		if children, ok := childMap[id]; ok {
			node.Children = make([]TreeNode, 0, len(children))
			for _, childID := range children {
				node.Children = append(node.Children, assemble(childID))
			}
		}
		return node
	}

	tree := make([]TreeNode, 0, len(rootIDs))
	for _, id := range rootIDs {
		tree = append(tree, assemble(id))
	}
	return tree
}

func toVMDetail(node *string, vmid *int32, isTemplate *bool, cpuCount, memoryMB *int32, diskGB *float64) *VMDetail {
	vm := &VMDetail{
		CPUCount: cpuCount,
		MemoryMB: memoryMB,
		DiskGB:   diskGB,
	}
	if node != nil {
		vm.Node = *node
	}
	if vmid != nil {
		vm.VMID = *vmid
	}
	if isTemplate != nil {
		vm.IsTemplate = *isTemplate
	}
	return vm
}

func writeInventoryError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithLetter),
		errors.Is(err, names.ErrInvalidCharacters):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		writeLoggedError(c, http.StatusInternalServerError, "inventory mutation failed", "inventory mutation", err)
	}
}
