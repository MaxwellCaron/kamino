package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type PermissionEnvelope struct {
	AllowedMask authorization.Mask `json:"allowed_mask"`
	DeniedMask  authorization.Mask `json:"denied_mask"`
}

func currentPrincipalID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get("userID")
	if !ok {
		return uuid.Nil, false
	}

	id, ok := value.(uuid.UUID)
	return id, ok && id != uuid.Nil
}

func toPermissionEnvelope(value authorization.EffectivePermissions) PermissionEnvelope {
	return PermissionEnvelope{
		AllowedMask: value.AllowedMask,
		DeniedMask:  value.DeniedMask,
	}
}

func requireInventoryPermission(
	c *gin.Context,
	authzService *authorization.Service,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
) bool {
	err := authzService.Require(c.Request.Context(), principalID, itemID, required)
	switch {
	case err == nil:
		return true
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return false
	case authorization.IsForbidden(err):
		writeForbidden(c)
		return false
	default:
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize inventory resource", err)
		return false
	}
}

func requireVMPermission(
	c *gin.Context,
	authzService *authorization.Service,
	principalID uuid.UUID,
	node string,
	vmid int32,
	required authorization.Mask,
) (uuid.UUID, bool) {
	itemID, err := authzService.ResolveVMItemID(c.Request.Context(), node, vmid)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "vm not found"})
		return uuid.Nil, false
	default:
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "resolve vm inventory item", err)
		return uuid.Nil, false
	}

	if !requireInventoryPermission(c, authzService, principalID, itemID, required) {
		return uuid.Nil, false
	}

	return itemID, true
}
