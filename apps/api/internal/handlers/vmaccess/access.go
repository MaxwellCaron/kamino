package vmaccess

import (
	"context"
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func ResolveVerifiedVMItemPermission(
	ctx context.Context,
	authzService vmRecordAuthorizer,
	px vmIdentityReader,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	lock bool,
) (vmactions.Target, *httpx.RequestError) {
	err := authzService.Require(ctx, principalID, itemID, required)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "item not found",
		}
	case authorization.IsForbidden(err):
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusForbidden,
			UserMessage: "forbidden",
		}
	default:
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize inventory resource",
			Err:         err,
		}
	}

	return ResolveVerifiedVMItem(ctx, authzService, px, itemID, lock)
}

func ResolveVerifiedVMItem(
	ctx context.Context,
	authzService vmRecordAuthorizer,
	px vmIdentityReader,
	itemID uuid.UUID,
	lock bool,
) (vmactions.Target, *httpx.RequestError) {

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
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "vm not found",
		}
	default:
		return vmactions.Target{}, &httpx.RequestError{
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
	px vmIdentityReader,
	record authorization.VMRecord,
) (vmactions.Target, *httpx.RequestError) {
	_, err := proxmox.VerifyVMIdentity(ctx, px, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid), record.UpstreamUUID)
	switch {
	case err == nil:
	case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusConflict,
			UserMessage: "vm identity is not initialized in Proxmox",
		}
	case errors.Is(err, proxmox.ErrVMIdentityMismatch):
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusConflict,
			UserMessage: "inventory mapping is stale; upstream VM identity no longer matches",
		}
	default:
		return vmactions.Target{}, &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to verify VM identity",
			Operation:   "verify proxmox vm identity",
			Err:         err,
		}
	}

	return VerifiedVMTargetFromRecord(record), nil
}

func VerifyVMRecordIdentityForAction(
	ctx context.Context,
	px vmIdentityReader,
	record authorization.VMRecord,
	allowMissingUpstream bool,
) (vmactions.Target, *httpx.RequestError) {
	target, reqErr := verifyVMRecordIdentity(ctx, px, record)
	if allowMissingUpstream && reqErr != nil && proxmox.IsMissingVMError(reqErr.Err) {
		return VerifiedVMTargetFromRecord(record), nil
	}
	return target, reqErr
}

func VerifiedVMTargetFromRecord(record authorization.VMRecord) vmactions.Target {
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
func RequireVerifiedVMItemPermission(
	c *gin.Context,
	authzService vmRecordAuthorizer,
	px vmIdentityReader,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
	lock bool,
) (vmactions.Target, bool) {
	target, reqErr := ResolveVerifiedVMItemPermission(
		c.Request.Context(),
		authzService,
		px,
		principalID,
		itemID,
		required,
		lock,
	)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return vmactions.Target{}, false
	}

	return target, true
}

// requireVMCreateMetadataAccess gates Proxmox VM-create metadata endpoints
func RequireVMCreateMetadataAccess(
	c *gin.Context,
	authzService vmMetadataAuthorizer,
	principalID uuid.UUID,
) bool {
	hasCreateVM, err := authzService.HasAny(c.Request.Context(), principalID, authorization.CreateVM)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize vm create metadata", err)
		return false
	}
	if hasCreateVM {
		return true
	}

	isManager, err := authzService.IsManager(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize vm create metadata", err)
		return false
	}
	if !isManager {
		httpx.WriteForbidden(c)
		return false
	}

	return true
}

type vmRecordAuthorizer interface {
	httpx.InventoryAuthorizer
	GetVMRecord(context.Context, uuid.UUID) (authorization.VMRecord, error)
	GetVMRecordForUpdate(context.Context, uuid.UUID) (authorization.VMRecord, error)
}

type vmIdentityReader interface {
	GetVMIdentity(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error)
}

type vmMetadataAuthorizer interface {
	HasAny(context.Context, uuid.UUID, authorization.Mask) (bool, error)
	IsManager(context.Context, uuid.UUID) (bool, error)
}
