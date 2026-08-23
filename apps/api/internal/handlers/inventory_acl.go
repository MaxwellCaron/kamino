package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
		writeUnauthorized(c)
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
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

func writeInventoryACLError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound):
		writeLoggedError(c, http.StatusNotFound, err.Error(), "inventory acl lookup", err)
	case errors.Is(err, inventory.ErrInventoryPrincipalNotFound),
		errors.Is(err, inventory.ErrInventoryInvalidACL):
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "inventory acl validation", err)
	default:
		writeLoggedError(c, http.StatusInternalServerError, "inventory ACL update failed", "inventory ACL mutation", err)
	}
}
