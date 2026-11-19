package inventory

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/inventoryview"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type InventoryHandler struct {
	Service            *inventory.Service
	Notifier           *inventory.Notifier
	PX                 *proxmox.Client
	Authz              *authorization.Service
	Audit              *audit.Service
	PodVMAddressReader podVMAddressReader
	NetworkCatalog     *podnetwork.Catalog
}

// GetTree returns the full inventory tree.
// GET /api/v1/inventory/tree
func (h *InventoryHandler) GetTree(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	rows, err := h.Service.GetVisibleInventoryItems(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch inventory", "load inventory tree", err)
		return
	}
	vmItemIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.Node != nil {
			vmItemIDs = append(vmItemIDs, row.ID)
		}
	}
	addressesByItemID, err := h.loadPodVMAddresses(c.Request.Context(), vmItemIDs)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch inventory", "load inventory VM addresses", err)
		return
	}

	c.JSON(http.StatusOK, inventoryview.BuildTree(rows, addressesByItemID))
}

// GetItem returns a single inventory item with VM details.
// GET /api/v1/inventory/items/:id
func (h *InventoryHandler) GetItem(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid id")
		return
	}

	row, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch item", "load inventory item", err)
		return
	}
	if !authorization.Mask(row.AllowedMask).Has(authorization.View) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}

	item := inventoryview.BuildInventoryItem(row)
	addressesByItemID, err := h.loadPodVMAddresses(c.Request.Context(), []uuid.UUID{id})
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch item", "load inventory VM addresses", err)
		return
	}
	if item.VM != nil {
		item.VM.Addresses = addressesByItemID[id]
	}

	c.JSON(http.StatusOK, item)
}

// GetACL returns the direct ACL entries for an inventory item.
// GET /api/v1/inventory/items/:id/acl
func (h *InventoryHandler) GetACL(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid id")
		return
	}

	item, err := h.Service.GetInventoryItemWithPermissions(c.Request.Context(), principalID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "load inventory item ACL", err)
		return
	}
	if !authorization.Mask(item.AllowedMask).Has(authorization.ManagePermissions) {
		httpx.WriteForbidden(c)
		return
	}

	rows, err := h.Service.ListInventoryACLEntries(c.Request.Context(), id)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "list inventory ACL entries", err)
		return
	}
	inheritedRows, err := h.Service.ListInheritedInventoryACLEntries(c.Request.Context(), id)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to fetch ACL", "list inherited inventory ACL entries", err)
		return
	}

	entries := make([]inventoryview.InventoryACLEntry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, inventoryview.InventoryACLEntry{
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
	inheritedEntries := make([]inventoryview.InheritedInventoryACLEntry, 0, len(inheritedRows))
	for _, row := range inheritedRows {
		inheritedEntries = append(inheritedEntries, inventoryview.InheritedInventoryACLEntry{
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

	c.JSON(http.StatusOK, inventoryview.InventoryACL{
		Entries:          entries,
		InheritedEntries: inheritedEntries,
	})
}
