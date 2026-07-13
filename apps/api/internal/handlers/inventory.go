package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
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
	Description      *string            `json:"description,omitempty"`
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
	GuestType  string   `json:"guest_type"`
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
	Description        *string            `json:"description,omitempty"`
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
		writeUnauthorized(c)
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
		writeUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
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
