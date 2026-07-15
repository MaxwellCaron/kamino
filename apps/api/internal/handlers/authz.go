package handlers

import (
	"context"
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
	RequestMask authorization.Mask `json:"request_mask"`
}

type ManagementPermissionEnvelope struct {
	Grants []authorization.ManagementPermission `json:"grants"`
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
		RequestMask: value.RequestMask,
	}
}

func toManagementPermissionEnvelope(
	value authorization.EffectiveManagementPermissions,
) ManagementPermissionEnvelope {
	return ManagementPermissionEnvelope{
		Grants: value.Grants,
	}
}

func requireInventoryPermission(
	c *gin.Context,
	authzService vmAuthz,
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

type verifiedVMTarget struct {
	ItemID       uuid.UUID
	Node         string
	VMID         int
	UpstreamUUID uuid.UUID
	GuestType    proxmox.GuestType
}

type requestError struct {
	Status      int
	UserMessage string
	Operation   string
	Err         error
}

// Error lets a *requestError travel through error channels like errgroup.
func (e *requestError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.UserMessage
}

func parseItemIDParam(c *gin.Context) (uuid.UUID, bool) {
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return uuid.Nil, false
	}

	return itemID, true
}

func writeRequestError(c *gin.Context, reqErr *requestError) {
	if reqErr == nil {
		return
	}

	if reqErr.Err != nil {
		writeLoggedError(c, reqErr.Status, reqErr.UserMessage, reqErr.Operation, reqErr.Err)
		return
	}

	c.JSON(reqErr.Status, gin.H{"error": reqErr.UserMessage})
}

func resolveVerifiedVMItemPermission(
	ctx context.Context,
	authzService vmAuthz,
	px vmProxmox,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	lock bool,
) (verifiedVMTarget, *requestError) {
	err := authzService.Require(ctx, principalID, itemID, required)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "item not found",
		}
	case authorization.IsForbidden(err):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusForbidden,
			UserMessage: "forbidden",
		}
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize inventory resource",
			Err:         err,
		}
	}

	var record authorization.VMRecord
	if lock {
		record, err = authzService.GetVMRecordForUpdate(ctx, itemID)
	} else {
		record, err = authzService.GetVMRecord(ctx, itemID)
	}

	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "vm not found",
		}
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "resolve vm inventory mapping",
			Err:         err,
		}
	}

	return verifyVMRecordIdentity(ctx, px, record)
}

func verifyVMRecordIdentity(
	ctx context.Context,
	px vmProxmox,
	record authorization.VMRecord,
) (verifiedVMTarget, *requestError) {
	identity, err := px.GetVMIdentity(ctx, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid))
	switch {
	case err == nil:
	case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "vm identity is not initialized in Proxmox",
		}
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to verify VM identity",
			Operation:   "verify proxmox vm identity",
			Err:         err,
		}
	}

	if identity.UpstreamUUID != record.UpstreamUUID {
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "inventory mapping is stale; upstream VM identity no longer matches",
		}
	}

	return verifiedVMTarget{
		ItemID:       record.InventoryItemID,
		Node:         record.Node,
		VMID:         int(record.Vmid),
		UpstreamUUID: record.UpstreamUUID,
		GuestType:    proxmox.GuestType(record.GuestType),
	}, nil
}

// requireVerifiedVMItemPermission keeps sensitive VM actions bound to the
// inventory item rather than trusting a client-provided node/vmid.
//
// Before any sensitive action:
//  1. Load the VM row by inventory_item_id.
//  2. For mutating paths, the lock=true path uses the FOR UPDATE lookup
//     variant, but with the current pool-backed callers it does not hold a
//     lock across the full verify-then-act window.
//  3. Fetch current Proxmox config for the resolved node/vmid.
//  4. Extract the current upstream UUID from Proxmox.
//  5. Compare it to the stored upstream_uuid.
//  6. Only execute the action if they match.
//
// VM mutations are serialized by vm_action_claims around the actual action.
func requireVerifiedVMItemPermission(
	c *gin.Context,
	authzService vmAuthz,
	px vmProxmox,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	lock bool,
) (verifiedVMTarget, bool) {
	target, reqErr := resolveVerifiedVMItemPermission(
		c.Request.Context(),
		authzService,
		px,
		principalID,
		itemID,
		required,
		lock,
	)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return verifiedVMTarget{}, false
	}

	return target, true
}

// requireVMCreateMetadataAccess gates Proxmox VM-create metadata endpoints
func requireVMCreateMetadataAccess(
	c *gin.Context,
	authzService vmCreateAuthz,
	principalID uuid.UUID,
) bool {
	hasCreateVM, err := authzService.HasAny(c.Request.Context(), principalID, authorization.CreateVM)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize vm create metadata", err)
		return false
	}
	if hasCreateVM {
		return true
	}

	isManager, err := authzService.IsManager(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize vm create metadata", err)
		return false
	}
	if !isManager {
		writeForbidden(c)
		return false
	}

	return true
}

func requireManagementPermission(
	c *gin.Context,
	authzService interface {
		RequireManagement(
			ctx context.Context,
			principalID uuid.UUID,
			required authorization.ManagementPermission,
		) error
	},
	principalID uuid.UUID,
	required authorization.ManagementPermission,
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
