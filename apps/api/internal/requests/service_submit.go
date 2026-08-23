package requests

import (
	"context"
	"errors"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) SubmitInventoryPowerRequest(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	itemID uuid.UUID,
	action database.InventoryRequestPowerAction,
) (database.GetRequestByIDRow, error) {
	if !isValidPowerAction(action) {
		return database.GetRequestByIDRow{}, ErrRequestInvalidPowerAction
	}
	if err := s.ensureInventoryRequestSubmissionAllowed(ctx, requesterPrincipalID, itemID, authorization.PowerVM); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	return s.createInventoryRequest(
		ctx,
		requesterPrincipalID,
		RequestKindInventoryVMPower,
		itemID,
		validPowerAction(action),
		nil,
	)
}

func (s *Service) SubmitInventorySnapshotCreateRequest(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	itemID uuid.UUID,
	snapshotName string,
) (database.GetRequestByIDRow, error) {
	if err := s.ensureInventoryRequestSubmissionAllowed(ctx, requesterPrincipalID, itemID, authorization.SnapshotVM); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	snapshotName = strings.TrimSpace(snapshotName)
	if snapshotName == "" {
		return database.GetRequestByIDRow{}, ErrRequestInvalidSnapshot
	}

	return s.createInventoryRequest(
		ctx,
		requesterPrincipalID,
		RequestKindInventoryVMSnapshotCreate,
		itemID,
		invalidPowerAction(),
		&snapshotName,
	)
}

func (s *Service) SubmitInventorySnapshotRollbackRequest(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	itemID uuid.UUID,
	snapshotName string,
) (database.GetRequestByIDRow, error) {
	if err := s.ensureInventoryRequestSubmissionAllowed(ctx, requesterPrincipalID, itemID, authorization.SnapshotVM); err != nil {
		return database.GetRequestByIDRow{}, err
	}

	snapshotName = strings.TrimSpace(snapshotName)
	if snapshotName == "" {
		return database.GetRequestByIDRow{}, ErrRequestInvalidSnapshot
	}

	return s.createInventoryRequest(
		ctx,
		requesterPrincipalID,
		RequestKindInventoryVMSnapshotRollback,
		itemID,
		invalidPowerAction(),
		&snapshotName,
	)
}

func (s *Service) SubmitPersonalPodRequest(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
) (database.GetRequestByIDRow, error) {
	if s.personalPods == nil || !s.personalPods.PersonalPodsEnabled() {
		return database.GetRequestByIDRow{}, ErrRequestUnsupportedKind
	}

	q := database.New(s.db)
	if _, err := q.GetPersonalPodByUser(ctx, requesterPrincipalID); err == nil {
		return database.GetRequestByIDRow{}, ErrRequestPersonalPodExists
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return database.GetRequestByIDRow{}, err
	}
	if _, err := q.GetPendingRequestByRequesterAndKind(ctx, database.GetPendingRequestByRequesterAndKindParams{
		RequesterPrincipalID: requesterPrincipalID,
		Kind:                 RequestKindPersonalPodCreate,
	}); err == nil {
		return database.GetRequestByIDRow{}, ErrRequestDuplicatePending
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return database.GetRequestByIDRow{}, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}
	defer tx.Rollback(ctx)

	q = database.New(tx)
	if _, err := q.LockRequestRequester(ctx, requesterPrincipalID); err != nil {
		return database.GetRequestByIDRow{}, err
	}
	if _, err := q.GetPersonalPodByUser(ctx, requesterPrincipalID); err == nil {
		return database.GetRequestByIDRow{}, ErrRequestPersonalPodExists
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return database.GetRequestByIDRow{}, err
	}
	if _, err := q.GetPendingRequestByRequesterAndKind(ctx, database.GetPendingRequestByRequesterAndKindParams{
		RequesterPrincipalID: requesterPrincipalID,
		Kind:                 RequestKindPersonalPodCreate,
	}); err == nil {
		return database.GetRequestByIDRow{}, ErrRequestDuplicatePending
	} else if !errors.Is(err, pgx.ErrNoRows) {
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
		Family:               database.RequestFamilyPersonalPod,
		Kind:                 RequestKindPersonalPodCreate,
		RequesterPrincipalID: requesterPrincipalID,
	})
	if err != nil {
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
		nil, "succeeded", nil,
		map[string]any{
			"request_id":   requestRow.ID.String(),
			"request_kind": RequestKindPersonalPodCreate,
		})

	s.notify(ctx, nil, requestChangedEvent(
		requestRow.ID,
		requesterPrincipalID,
		RequestKindPersonalPodCreate,
	))

	row, err := database.New(s.db).GetRequestByID(ctx, requestRow.ID)
	if err != nil {
		return database.GetRequestByIDRow{}, err
	}

	return row, nil
}
