package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// liveCheckInterval is the shared SSE/VNC live-session revalidation cadence.
const liveCheckInterval = 20 * time.Second

// liveSessionValidator rechecks an already-established connection's session family.
type liveSessionValidator interface {
	ValidateLiveSession(ctx context.Context, sessionID, principalID uuid.UUID) error
}

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

func currentSessionID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get("sessionID")
	if !ok {
		return uuid.Nil, false
	}

	id, ok := value.(uuid.UUID)
	return id, ok && id != uuid.Nil
}

// freshAuthzContext wraps ctx in a new, empty principal-expansion cache.
func freshAuthzContext(ctx context.Context) context.Context {
	return authorization.WithPrincipalCache(ctx)
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

type requestError struct {
	Status      int
	UserMessage string
	Operation   string
	Err         error
}

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
) (vmactions.Target, *requestError) {
	err := authzService.Require(ctx, principalID, itemID, required)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return vmactions.Target{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "item not found",
		}
	case authorization.IsForbidden(err):
		return vmactions.Target{}, &requestError{
			Status:      http.StatusForbidden,
			UserMessage: "forbidden",
		}
	default:
		return vmactions.Target{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize inventory resource",
			Err:         err,
		}
	}

	return resolveVerifiedVMItem(ctx, authzService, px, itemID, lock)
}

func resolveVerifiedVMItem(
	ctx context.Context,
	authzService vmAuthz,
	px vmProxmox,
	itemID uuid.UUID,
	lock bool,
) (vmactions.Target, *requestError) {

	var record authorization.VMRecord
	var err error
	if lock {
		record, err = authzService.GetVMRecordForUpdate(ctx, itemID)
	} else {
		record, err = authzService.GetVMRecord(ctx, itemID)
	}

	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return vmactions.Target{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "vm not found",
		}
	default:
		return vmactions.Target{}, &requestError{
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
) (vmactions.Target, *requestError) {
	_, err := proxmox.VerifyVMIdentity(ctx, px, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid), record.UpstreamUUID)
	switch {
	case err == nil:
	case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
		return vmactions.Target{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "vm identity is not initialized in Proxmox",
		}
	case errors.Is(err, proxmox.ErrVMIdentityMismatch):
		return vmactions.Target{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "inventory mapping is stale; upstream VM identity no longer matches",
		}
	default:
		return vmactions.Target{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to verify VM identity",
			Operation:   "verify proxmox vm identity",
			Err:         err,
		}
	}

	return verifiedVMTargetFromRecord(record), nil
}

func verifyVMRecordIdentityForAction(
	ctx context.Context,
	px vmProxmox,
	record authorization.VMRecord,
	allowMissingUpstream bool,
) (vmactions.Target, *requestError) {
	target, reqErr := verifyVMRecordIdentity(ctx, px, record)
	if allowMissingUpstream && reqErr != nil && isMissingProxmoxVMError(reqErr.Err) {
		return verifiedVMTargetFromRecord(record), nil
	}
	return target, reqErr
}

func verifiedVMTargetFromRecord(record authorization.VMRecord) vmactions.Target {
	return vmactions.Target{
		ItemID:    record.InventoryItemID,
		Node:      record.Node,
		VMID:      int(record.Vmid),
		GuestType: proxmox.GuestType(record.GuestType),
	}
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
) (vmactions.Target, bool) {
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
		return vmactions.Target{}, false
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
