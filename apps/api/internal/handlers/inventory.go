package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
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
	Authz    *authorization.Service
	Audit    *audit.Service
}

// JSON response types

type TreeNode struct {
	ID               uuid.UUID          `json:"id"`
	Name             string             `json:"name"`
	Kind             string             `json:"kind"`
	DirectVMLimit    *int32             `json:"direct_vm_limit"`
	EffectiveVMLimit *int32             `json:"effective_vm_limit"`
	VMCount          *int32             `json:"vm_count"`
	Permissions      PermissionEnvelope `json:"permissions"`
	Children         []TreeNode         `json:"children,omitempty"`
	VM               *VMDetail          `json:"vm,omitempty"`
}

type VMDetail struct {
	Node       string   `json:"node"`
	VMID       int32    `json:"vmid"`
	IsTemplate bool     `json:"is_template"`
	Notes      *string  `json:"notes,omitempty"`
	CPUCount   *int32   `json:"cpu_count,omitempty"`
	MemoryMB   *int32   `json:"memory_mb,omitempty"`
	DiskGB     *float64 `json:"disk_gb,omitempty"`
}

type InventoryItem struct {
	ID                 uuid.UUID          `json:"id"`
	ParentID           *uuid.UUID         `json:"parent_id"`
	Kind               string             `json:"kind"`
	Name               string             `json:"name"`
	InheritPermissions bool               `json:"inherit_permissions"`
	DirectVMLimit      *int32             `json:"direct_vm_limit"`
	EffectiveVMLimit   *int32             `json:"effective_vm_limit"`
	VMCount            *int32             `json:"vm_count"`
	Permissions        PermissionEnvelope `json:"permissions"`
	VM                 *VMDetail          `json:"vm,omitempty"`
}

type InventoryACLEntry struct {
	ID                  uuid.UUID `json:"id"`
	PrincipalID         uuid.UUID `json:"principal_id"`
	PrincipalType       string    `json:"principal_type"`
	PrincipalExternalID string    `json:"principal_external_id"`
	PrincipalName       *string   `json:"principal_name"`
	Effect              string    `json:"effect"`
	Permissions         int64     `json:"permissions"`
	Immutable           bool      `json:"immutable"`
}

type InheritedInventoryACLEntry struct {
	ID                  uuid.UUID `json:"id"`
	SourceItemID        uuid.UUID `json:"source_item_id"`
	SourceItemName      string    `json:"source_item_name"`
	PrincipalID         uuid.UUID `json:"principal_id"`
	PrincipalType       string    `json:"principal_type"`
	PrincipalExternalID string    `json:"principal_external_id"`
	PrincipalName       *string   `json:"principal_name"`
	Effect              string    `json:"effect"`
	Permissions         int64     `json:"permissions"`
	Immutable           bool      `json:"immutable"`
}

type InventoryACL struct {
	Entries          []InventoryACLEntry          `json:"entries"`
	InheritedEntries []InheritedInventoryACLEntry `json:"inherited_entries"`
}

// GetTree returns the full inventory tree.
// GET /api/v1/inventory/tree
func (h *InventoryHandler) GetTree(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	rows, err := h.Service.GetVisibleInventoryItems(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch inventory", "load inventory tree", err)
		return
	}

	c.JSON(http.StatusOK, buildTree(rows))
}

// GetItem returns a single inventory item with VM details.
// GET /api/v1/inventory/items/:id
func (h *InventoryHandler) GetItem(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch item", "load inventory item", err)
		return
	}
	if !authorization.Mask(row.AllowedMask).Has(authorization.View) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}

	c.JSON(http.StatusOK, buildInventoryItem(row))
}

// GetACL returns the direct ACL entries for an inventory item.
// GET /api/v1/inventory/items/:id/acl
func (h *InventoryHandler) GetACL(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "load inventory item ACL", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.ManagePermissions) {
		writeForbidden(c)
		return
	}

	rows, err := h.Service.ListInventoryACLEntries(c.Request.Context(), id)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "list inventory ACL entries", err)
		return
	}
	inheritedRows, err := h.Service.ListInheritedInventoryACLEntries(c.Request.Context(), id)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "list inherited inventory ACL entries", err)
		return
	}

	entries := make([]InventoryACLEntry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, InventoryACLEntry{
			ID:                  row.ID,
			PrincipalID:         row.PrincipalID,
			PrincipalType:       string(row.PrincipalType),
			PrincipalExternalID: row.ExternalID,
			PrincipalName:       row.Name,
			Effect:              string(row.Effect),
			Permissions:         row.Permissions,
			Immutable:           h.Service.IsProtectedACLPrincipal(row.PrincipalID),
		})
	}
	inheritedEntries := make([]InheritedInventoryACLEntry, 0, len(inheritedRows))
	for _, row := range inheritedRows {
		inheritedEntries = append(inheritedEntries, InheritedInventoryACLEntry{
			ID:                  row.ID,
			SourceItemID:        row.SourceItemID,
			SourceItemName:      row.SourceItemName,
			PrincipalID:         row.PrincipalID,
			PrincipalType:       string(row.PrincipalType),
			PrincipalExternalID: row.ExternalID,
			PrincipalName:       row.Name,
			Effect:              string(row.Effect),
			Permissions:         row.Permissions,
			Immutable:           h.Service.IsProtectedACLPrincipal(row.PrincipalID),
		})
	}

	c.JSON(http.StatusOK, InventoryACL{
		Entries:          entries,
		InheritedEntries: inheritedEntries,
	})
}

type inventoryACLEntryRequest struct {
	PrincipalID uuid.UUID `json:"principal_id" binding:"required"`
	Effect      string    `json:"effect" binding:"required"`
	Permissions int64     `json:"permissions" binding:"required"`
}

type updateInventoryACLRequest struct {
	Entries []inventoryACLEntryRequest `json:"entries"`
}

// UpdateACL replaces the direct ACL entries for an inventory item.
// PUT /api/v1/inventory/items/:id/acl
func (h *InventoryHandler) UpdateACL(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req updateInventoryACLRequest
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
		writeLoggedError(c, http.StatusInternalServerError, "failed to update ACL", "load inventory item ACL", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.ManagePermissions) {
		writeForbidden(c)
		return
	}

	entries := make([]inventory.ACLEntryInput, 0, len(req.Entries))
	for _, entry := range req.Entries {
		entries = append(entries, inventory.ACLEntryInput{
			PrincipalID: entry.PrincipalID,
			Effect:      database.InventoryAceEffect(entry.Effect),
			Permissions: entry.Permissions,
		})
	}

	if err := h.Service.ReplaceInventoryACL(
		c.Request.Context(),
		id,
		entries,
	); err != nil {
		writeInventoryACLError(c, err)
		return
	}

	targetKind := "vm"
	if item.Kind == database.InventoryItemKindFolder {
		targetKind = "folder"
	}
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "acl.update",
		TargetKind:       targetKind,
		InventoryItemID:  &id,
		Metadata:         map[string]any{"entries_count": len(entries)},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type moveInventoryItemRequest struct {
	ItemID   uuid.UUID `json:"item_id" binding:"required"`
	ParentID uuid.UUID `json:"parent_id" binding:"required"`
}

type moveInventoryItemsRequest struct {
	ItemIDs  []uuid.UUID `json:"item_ids" binding:"required"`
	ParentID uuid.UUID   `json:"parent_id" binding:"required"`
}

// MoveItem persists an inventory move initiated from drag and drop.
// POST /api/v1/inventory/move
func (h *InventoryHandler) MoveItem(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req moveInventoryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, req.ItemID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize move", "load inventory item for move", err)
		return
	}

	target, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, req.ParentID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "parent not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize move", "load inventory parent for move", err)
		return
	}

	requiredOnItem := authorization.MoveFolder
	requiredOnTarget := authorization.CreateFolder
	if item.Kind == database.InventoryItemKindVm {
		requiredOnItem = authorization.MoveVM
		requiredOnTarget = authorization.CreateVM
	}

	if !authorization.Mask(item.AllowedMask).Has(requiredOnItem) ||
		!authorization.Mask(target.AllowedMask).Has(requiredOnTarget) {
		writeForbidden(c)
		return
	}

	if err := h.Service.MoveInventoryItem(c.Request.Context(), req.ItemID, req.ParentID); err != nil {
		writeInventoryError(c, err)
		return
	}

	moveTargetKind := "vm"
	if item.Kind == database.InventoryItemKindFolder {
		moveTargetKind = "folder"
	}
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "item.move",
		TargetKind:       moveTargetKind,
		InventoryItemID:  &req.ItemID,
		Metadata:         map[string]any{"to_parent_id": req.ParentID.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MoveItems persists a bulk inventory move initiated from multiselect drag and drop.
// POST /api/v1/inventory/move/bulk
func (h *InventoryHandler) MoveItems(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req moveInventoryItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if len(req.ItemIDs) == 0 {
		writeInvalidRequest(c, "at least one item is required")
		return
	}

	target, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, req.ParentID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "parent not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize move", "load inventory parent for move", err)
		return
	}

	itemMap, err := h.Service.GetInventoryItemsWithPermissions(c.Request.Context(), principalID, req.ItemIDs)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize move", "load inventory items for move", err)
		return
	}

	for _, itemID := range req.ItemIDs {
		item, ok := itemMap[itemID]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
			return
		}

		requiredOnItem := authorization.MoveFolder
		requiredOnTarget := authorization.CreateFolder
		if item.Kind == database.InventoryItemKindVm {
			requiredOnItem = authorization.MoveVM
			requiredOnTarget = authorization.CreateVM
		}

		if !authorization.Mask(item.AllowedMask).Has(requiredOnItem) ||
			!authorization.Mask(target.AllowedMask).Has(requiredOnTarget) {
			writeForbidden(c)
			return
		}
	}

	if err := h.Service.MoveInventoryItems(c.Request.Context(), req.ItemIDs, req.ParentID); err != nil {
		writeInventoryError(c, err)
		return
	}

	for _, itemID := range req.ItemIDs {
		movedItem := itemMap[itemID]
		movedTargetKind := "vm"
		if movedItem.Kind == database.InventoryItemKindFolder {
			movedTargetKind = "folder"
		}
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "item.move",
			TargetKind:       movedTargetKind,
			InventoryItemID:  &itemID,
			Metadata:         map[string]any{"to_parent_id": req.ParentID.String()},
		})
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
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

type renameFolderRequest struct {
	Name string `json:"name" binding:"required"`
}

type updateFolderVMLimitRequest struct {
	VMLimit *int32 `json:"vm_limit"`
}

// RenameFolder renames a folder without changing its identity.
// POST /api/v1/inventory/folders/:id/rename
func (h *InventoryHandler) RenameFolder(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

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

	if err := h.Service.RenameFolder(c.Request.Context(), id, req.Name); err != nil {
		writeInventoryError(c, err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "folder.rename",
		TargetKind:       "folder",
		InventoryItemID:  &id,
		Metadata:         map[string]any{"name": req.Name},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UpdateFolderVMLimit sets or clears a folder's direct VM/template limit.
// PUT /api/v1/inventory/folders/:id/vm-limit
func (h *InventoryHandler) UpdateFolderVMLimit(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
		if err := h.PX.DeleteVMStopped(c.Request.Context(), vm.Node, int(vm.VMID)); err != nil {
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

// buildTree converts a flat list of inventory rows into a nested tree.
func buildTree(rows []database.GetVisibleInventoryItemsForPrincipalRow) []TreeNode {
	nodes := make(map[uuid.UUID]*TreeNode, len(rows))
	childMap := make(map[uuid.UUID][]uuid.UUID, len(rows))

	for _, row := range rows {
		node := &TreeNode{
			ID:               row.ID,
			Name:             row.Name,
			Kind:             string(row.Kind),
			DirectVMLimit:    row.DirectVmLimit,
			EffectiveVMLimit: positiveInt32Ptr(row.EffectiveVmLimit),
			VMCount:          folderCountPtr(row.Kind, row.VmCount),
			Permissions:      inventoryPermissionEnvelope(row.Kind, row.AllowedMask, row.DeniedMask),
		}

		if row.Node != nil {
			node.VM = toVMDetail(row.Node, row.Vmid, row.IsTemplate, row.Notes, row.CpuCount, row.MemoryMb, row.DiskGb)
		}

		nodes[row.ID] = node
	}

	rootIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.ParentID != nil {
			if _, ok := nodes[*row.ParentID]; ok {
				childMap[*row.ParentID] = append(childMap[*row.ParentID], row.ID)
				continue
			}
		}
		rootIDs = append(rootIDs, row.ID)
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

func buildInventoryItem(row database.GetInventoryItemWithPermissionsRow) InventoryItem {
	item := InventoryItem{
		ID:                 row.ID,
		ParentID:           row.ParentID,
		Kind:               string(row.Kind),
		Name:               row.Name,
		InheritPermissions: row.InheritPermissions,
		DirectVMLimit:      row.DirectVmLimit,
		EffectiveVMLimit:   positiveInt32Ptr(row.EffectiveVmLimit),
		VMCount:            folderCountPtr(row.Kind, row.VmCount),
		Permissions:        inventoryPermissionEnvelope(row.Kind, row.AllowedMask, row.DeniedMask),
	}

	if row.Node != nil {
		item.VM = toVMDetail(
			row.Node,
			row.Vmid,
			row.IsTemplate,
			row.Notes,
			row.CpuCount,
			row.MemoryMb,
			row.DiskGb,
		)
	}

	return item
}

func positiveInt32Ptr(value int32) *int32 {
	if value <= 0 {
		return nil
	}
	return &value
}

func folderCountPtr(kind database.InventoryItemKind, count int32) *int32 {
	if kind != database.InventoryItemKindFolder {
		return nil
	}
	return &count
}

func toVMDetail(node *string, vmid *int32, isTemplate *bool, notes *string, cpuCount, memoryMB *int32, diskGB *float64) *VMDetail {
	vm := &VMDetail{
		Notes:    notes,
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

func inventoryPermissionEnvelope(
	kind database.InventoryItemKind,
	allowedMask int64,
	deniedMask int64,
) PermissionEnvelope {
	targetKind := authorization.InventoryPermissionTargetKindVM
	if kind == database.InventoryItemKindFolder {
		targetKind = authorization.InventoryPermissionTargetKindFolder
	}

	return toPermissionEnvelope(
		authorization.EffectivePermissionsForTargetKind(
			targetKind,
			authorization.Mask(allowedMask),
			authorization.Mask(deniedMask),
		),
	)
}

func writeInventoryError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, inventory.ErrInventoryFolderDepthExceeded),
		errors.Is(err, inventory.ErrInventoryInvalidFolderLimit),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithLetter),
		errors.Is(err, names.ErrInvalidCharacters):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict),
		errors.Is(err, inventory.ErrInventoryFolderLimitExceeded),
		errors.Is(err, inventory.ErrInventoryItemInUse):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		writeLoggedError(c, http.StatusInternalServerError, "inventory mutation failed", "inventory mutation", err)
	}
}

func writeInventoryACLError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, inventory.ErrInventoryPrincipalNotFound),
		errors.Is(err, inventory.ErrInventoryInvalidACL):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	default:
		writeLoggedError(c, http.StatusInternalServerError, "inventory ACL update failed", "inventory ACL mutation", err)
	}
}
