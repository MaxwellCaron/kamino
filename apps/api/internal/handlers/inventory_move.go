package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
		writeUnauthorized(c)
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
		writeUnauthorized(c)
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
