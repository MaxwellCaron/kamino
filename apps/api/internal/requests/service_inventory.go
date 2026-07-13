package requests

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) createInventoryRequest(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	kind string,
	itemID uuid.UUID,
	powerAction database.NullInventoryRequestPowerAction,
	snapshotName *string,
) (database.GetRequestByIDRow, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if _, err := q.LockRequestRequester(ctx, requesterPrincipalID); err != nil {
		return database.GetRequestByIDRow{}, err
	}
	pendingCount, err := q.CountPendingRequestsByRequester(ctx, requesterPrincipalID)
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}
	if pendingCount >= maxPendingRequestsPerUser {
		return database.GetRequestByIDRow{}, ErrRequestLimitExceeded
	}

	requestRow, err := q.CreateRequest(ctx, database.CreateRequestParams{
		Family:               database.RequestFamilyInventory,
		Kind:                 kind,
		RequesterPrincipalID: requesterPrincipalID,
	})
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}

	if _, err := q.CreateInventoryRequest(ctx, database.CreateInventoryRequestParams{
		RequestID:       requestRow.ID,
		InventoryItemID: itemID,
		PowerAction:     powerAction,
		SnapshotName:    snapshotName,
	}); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestRow.ID,
		EventKind:        database.RequestEventKindSubmitted,
		ActorPrincipalID: &requesterPrincipalID,
		FromStatus:       invalidRequestStatus(),
		ToStatus:         database.RequestStatusPending,
		ErrorMessage:     nil,
	}); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	s.recordAuditEvent(ctx, &requesterPrincipalID, "request.submit",
		&itemID, "succeeded", nil,
		map[string]any{"request_id": requestRow.ID.String(), "request_kind": kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestRow.ID,
		requesterPrincipalID,
		kind,
	))

	row, err := database.New(s.db).GetRequestByID(ctx, requestRow.ID)
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}

	return row, nil
}

func (s *Service) ensureInventoryRequestSubmissionAllowed(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
) error {
	item, err := s.inventory.GetInventoryItemByID(ctx, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRequestNotFound
		}
		return err
	}
	if item.Kind != database.InventoryItemKindVm {
		return ErrRequestForbidden
	}

	perms, err := s.authz.EffectivePermissions(ctx, requesterPrincipalID, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRequestNotFound
		}
		return err
	}

	if perms.Has(required) {
		return ErrRequestDirectExecution
	}
	if !perms.CanRequest(required) {
		return ErrRequestForbidden
	}

	return nil
}

func (s *Service) ensureRequestAccess(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	requesterPrincipalID uuid.UUID,
	requestKind string,
) error {
	if actorPrincipalID == requesterPrincipalID {
		return nil
	}

	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return err
	}
	if !canReviewRequestKind(reviewerPermissions, requestKind) {
		return ErrRequestForbidden
	}

	return nil
}

func (s *Service) reviewerPermissions(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
) (authorization.EffectiveManagementPermissions, error) {
	perms, err := s.authz.EffectiveManagementPermissions(ctx, actorPrincipalID)
	if err != nil {
		return authorization.EffectiveManagementPermissions{}, err
	}
	if !perms.Has(authorization.ManagementPermissionManager) {
		return authorization.EffectiveManagementPermissions{}, ErrRequestForbidden
	}

	return perms, nil
}

func isInventoryVMRequestKind(requestKind string) bool {
	switch requestKind {
	case RequestKindInventoryVMPower,
		RequestKindInventoryVMSnapshotCreate,
		RequestKindInventoryVMSnapshotRollback:
		return true
	default:
		return false
	}
}

func (s *Service) acquireInventoryRequestClaim(
	ctx context.Context,
	locked database.GetRequestForExecutionRow,
	reviewerPrincipalID uuid.UUID,
) (func(), error) {
	if !isInventoryVMRequestKind(locked.Kind) {
		return nil, nil
	}
	if s.vmClaims == nil {
		return nil, ErrRequestServiceUnavailable
	}
	if locked.InventoryItemID == nil {
		return nil, ErrRequestMissingPayload
	}

	itemID := *locked.InventoryItemID
	if err := s.vmClaims.Claim(
		ctx,
		itemID,
		"request:"+locked.Kind,
		reviewerPrincipalID,
		locked.ID.String(),
	); err != nil {
		if vmactions.IsActionInProgress(err) {
			return nil, ErrRequestActionInProgress
		}
		return nil, err
	}

	release := func() {
		_ = s.vmClaims.Release(context.WithoutCancel(ctx), itemID)
	}
	return release, nil
}

func canReviewRequestKind(
	perms authorization.EffectiveManagementPermissions,
	requestKind string,
) bool {
	if !perms.Has(authorization.ManagementPermissionManager) {
		return false
	}

	switch requestKind {
	case RequestKindInventoryVMPower,
		RequestKindInventoryVMSnapshotCreate,
		RequestKindInventoryVMSnapshotRollback,
		RequestKindPersonalPodCreate:
		return true
	default:
		return false
	}
}
