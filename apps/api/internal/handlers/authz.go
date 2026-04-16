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

type ManagementPermissionEnvelope struct {
	AllowedMask authorization.ManagementMask `json:"allowed_mask"`
	DeniedMask  authorization.ManagementMask `json:"denied_mask"`
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

func toManagementPermissionEnvelope(
	value authorization.EffectiveManagementPermissions,
) ManagementPermissionEnvelope {
	return ManagementPermissionEnvelope{
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

func requireManagementPermission(
	c *gin.Context,
	authzService *authorization.Service,
	principalID uuid.UUID,
	required authorization.ManagementMask,
) bool {
	err := authzService.RequireManagement(c.Request.Context(), principalID, required)
	switch {
	case err == nil:
		return true
	case authorization.IsForbidden(err):
		writeForbidden(c)
		return false
	default:
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize management resource", err)
		return false
	}
}

type AuthorizationHandler struct {
	Authz *authorization.Service
}

type updateManagementACLRequest struct {
	Permissions authorization.ManagementMask `json:"permissions"`
}

type managementACLResponse struct {
	GroupID     uuid.UUID                    `json:"group_id"`
	Permissions ManagementPermissionEnvelope `json:"permissions"`
	Immutable   bool                         `json:"immutable"`
}

func (h *AuthorizationHandler) GetManagementACLForGroup(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManageAccess) {
		return
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	permissions, immutable, err := h.Authz.GetManagementPermissionsForGroup(c.Request.Context(), groupID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	case authorization.IsManagementACLRequiresGroup(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": "management access only applies to groups"})
		return
	default:
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch management access", "get management acl for group", err)
		return
	}

	c.JSON(http.StatusOK, managementACLResponse{
		GroupID: groupID,
		Permissions: ManagementPermissionEnvelope{
			AllowedMask: permissions,
			DeniedMask:  0,
		},
		Immutable: immutable,
	})
}

func (h *AuthorizationHandler) UpdateManagementACLForGroup(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManageAccess) {
		return
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	var req updateManagementACLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	err = h.Authz.SetManagementPermissionsForGroup(
		c.Request.Context(),
		groupID,
		req.Permissions,
	)
	switch {
	case err == nil:
	case authorization.IsForbidden(err):
		writeForbidden(c)
		return
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	case authorization.IsManagementACLRequiresGroup(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": "management access only applies to groups"})
		return
	default:
		writeLoggedError(c, http.StatusBadRequest, "failed to update management access", "update management acl for group", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
