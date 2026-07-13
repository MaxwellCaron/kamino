package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type createFolderRequest struct {
	ParentID uuid.UUID `json:"parent_id" binding:"required"`
	Name     string    `json:"name" binding:"required"`
}

// CreateFolder creates a child folder within the inventory tree.
// POST /api/v1/inventory/folders
func (h *InventoryHandler) CreateFolder(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req createFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	parent, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, req.ParentID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "parent not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize folder create", "load inventory parent for folder create", err)
		return
	}
	if !authorization.Mask(parent.AllowedMask).Has(authorization.CreateFolder) {
		writeForbidden(c)
		return
	}

	id, err := h.Service.CreateFolder(c.Request.Context(), req.ParentID, req.Name)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.create",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata:         map[string]any{"name": req.Name},
	})
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type updateFolderDetailsRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description"`
}

type updateFolderVMLimitRequest struct {
	VMLimit *int32 `json:"vm_limit"`
}

// RenameFolder renames a folder without changing its identity.
// POST /api/v1/inventory/folders/:id/rename
func (h *InventoryHandler) RenameFolder(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	var req updateFolderDetailsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize folder rename", "load inventory item for folder rename", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.RenameFolder) {
		writeForbidden(c)
		return
	}

	if err := h.Service.UpdateFolderDetails(c.Request.Context(), id, req.Name, req.Description); err != nil {
		writeInventoryError(c, err)
		return
	}

	descriptionPresent := req.Description != nil && strings.TrimSpace(*req.Description) != ""
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.rename",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata: map[string]any{
			"name":                req.Name,
			"description_present": descriptionPresent,
		},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UpdateFolderVMLimit sets or clears a folder's direct VM/template limit.
// PUT /api/v1/inventory/folders/:id/vm-limit
func (h *InventoryHandler) UpdateFolderVMLimit(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	var req updateFolderVMLimitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize folder limit update", "load inventory item for folder limit update", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.ManagePermissions) {
		writeForbidden(c)
		return
	}

	if err := h.Service.UpdateFolderVMLimit(c.Request.Context(), id, req.VMLimit); err != nil {
		writeInventoryError(c, err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.vm_limit.update",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata:         map[string]any{"vm_limit": req.VMLimit},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteFolder recursively deletes a folder, its embedded Proxmox VMs/templates,
// and the folder subtree from inventory.
// DELETE /api/v1/inventory/folders/:id
func (h *InventoryHandler) DeleteFolder(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize folder delete", "load inventory item for folder delete", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.DeleteFolder) {
		writeForbidden(c)
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
		if err := h.PX.DeleteVMStopped(c.Request.Context(), proxmox.GuestType(vm.GuestType), vm.Node, int(vm.VMID)); err != nil {
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
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.delete",
			TargetKind:       "vm",
			InventoryItemID:  &vm.InventoryItemID,
		})
	}

	if err := h.Service.DeleteFolder(c.Request.Context(), id); err != nil {
		writeInventoryError(c, err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.delete",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata:         map[string]any{"vm_count": len(plan.ProxmoxVMs)},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
