package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// inventoryFolderDeletionConcurrencyLimit bounds concurrent guest deletions for generic folder delete.
const inventoryFolderDeletionConcurrencyLimit = 8

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
	h.reflectNewFolderToProxmox(id)

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.create",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata:         map[string]any{"name": req.Name},
	})
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// reflectNewFolderToProxmox creates the folder's Proxmox pool in the background, best-effort.
func (h *InventoryHandler) reflectNewFolderToProxmox(folderID uuid.UUID) {
	if h.PX == nil {
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		poolID, comment, err := h.Service.DesiredPoolForFolder(ctx, folderID)
		if err != nil {
			log.Printf("inventory folder create: failed to resolve desired pool: %v", err)
			return
		}
		if poolID == "" {
			return
		}

		desiredComment := ""
		if comment != nil {
			desiredComment = *comment
		}
		if err := h.PX.CreatePoolWithComment(ctx, poolID, desiredComment); err != nil {
			log.Printf("inventory folder create: failed to create proxmox pool %q: %v", poolID, err)
		}
	}()
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

	if h.PX == nil && (len(plan.ProxmoxVMs) > 0 || len(plan.ProxmoxPools) > 0) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "proxmox client unavailable"})
		return
	}

	var metadataErr error
	cbs := proxmoxFolderResourceDeletionCallbacks(h.PX, func(ctx context.Context) error {
		metadataErr = h.Service.DeleteFolder(ctx, id)
		return metadataErr
	})
	baseDeleteVM := cbs.deleteVM
	cbs.deleteVM = func(ctx context.Context, vm inventory.FolderDeletionVM) error {
		if err := baseDeleteVM(ctx, vm); err != nil {
			kind := "VM"
			if vm.IsTemplate {
				kind = "template"
			}
			return fmt.Errorf("failed to delete %s %q (%d): %w", kind, vm.Name, vm.VMID, err)
		}
		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.delete",
			TargetKind:       "vm",
			InventoryItemID:  &vm.InventoryItemID,
		})
		return nil
	}

	if err := runFolderResourceDeletion(c.Request.Context(), plan, inventoryFolderDeletionConcurrencyLimit, cbs); err != nil {
		if metadataErr != nil {
			writeInventoryError(c, metadataErr)
			return
		}
		logRequestError(c, fmt.Sprintf("delete inventory folder id=%s", id), err)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
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
