package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
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

type verifiedVMTarget struct {
	ItemID       uuid.UUID
	Node         string
	VMID         int
	UpstreamUUID uuid.UUID
}

func parseItemIDParam(c *gin.Context) (uuid.UUID, bool) {
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return uuid.Nil, false
	}

	return itemID, true
}

// requireVerifiedVMItemPermission keeps sensitive VM actions bound to the
// inventory item rather than trusting a client-provided node/vmid.
//
// Before any sensitive action:
//  1. Load the VM row by inventory_item_id.
//  2. For mutating paths, use the FOR UPDATE lookup variant.
//  3. Fetch current Proxmox config for the resolved node/vmid.
//  4. Extract the current upstream UUID from Proxmox.
//  5. Compare it to the stored upstream_uuid.
//  6. Only execute the action if they match.
func requireVerifiedVMItemPermission(
	c *gin.Context,
	authzService *authorization.Service,
	px *proxmox.Client,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	lock bool,
) (verifiedVMTarget, bool) {
	if !requireInventoryPermission(c, authzService, principalID, itemID, required) {
		return verifiedVMTarget{}, false
	}

	var (
		record authorization.VMRecord
		err    error
	)
	if lock {
		record, err = authzService.GetVMRecordForUpdate(c.Request.Context(), itemID)
	} else {
		record, err = authzService.GetVMRecord(c.Request.Context(), itemID)
	}
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "vm not found"})
		return verifiedVMTarget{}, false
	default:
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "resolve vm inventory mapping", err)
		return verifiedVMTarget{}, false
	}

	identity, err := px.GetVMIdentity(c.Request.Context(), record.Node, int(record.Vmid))
	switch {
	case err == nil:
	case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
		c.JSON(http.StatusConflict, gin.H{"error": "vm identity is not initialized in Proxmox"})
		return verifiedVMTarget{}, false
	default:
		writeLoggedError(c, http.StatusBadGateway, "failed to verify VM identity", "verify proxmox vm identity", err)
		return verifiedVMTarget{}, false
	}

	if identity.UpstreamUUID != record.UpstreamUUID {
		c.JSON(http.StatusConflict, gin.H{
			"error": "inventory mapping is stale; upstream VM identity no longer matches",
		})
		return verifiedVMTarget{}, false
	}

	return verifiedVMTarget{
		ItemID:       record.InventoryItemID,
		Node:         record.Node,
		VMID:         int(record.Vmid),
		UpstreamUUID: record.UpstreamUUID,
	}, true
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
