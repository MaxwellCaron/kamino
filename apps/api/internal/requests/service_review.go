package requests

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) ApproveRequest(
	ctx context.Context,
	reviewerPrincipalID uuid.UUID,
	requestID uuid.UUID,
) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, reviewerPrincipalID)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	locked, err := q.GetRequestForExecution(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotFound
		}
		return database.GetRequestByIDRow{}, nil, err
	}
	if locked.Status != database.RequestStatusPending {
		return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
	}
	if reviewerPrincipalID == locked.RequesterPrincipalID {
		return database.GetRequestByIDRow{}, nil, ErrRequestForbidden
	}
	if !canReviewRequestKind(reviewerPermissions, locked.Kind) {
		return database.GetRequestByIDRow{}, nil, ErrRequestForbidden
	}

	releaseClaim, claimErr := s.acquireInventoryRequestClaim(ctx, locked, reviewerPrincipalID)
	if claimErr != nil {
		return database.GetRequestByIDRow{}, nil, claimErr
	}
	if releaseClaim != nil {
		defer releaseClaim()
	}

	approved, err := q.ApproveRequest(ctx, database.ApproveRequestParams{
		ID:                  requestID,
		ReviewerPrincipalID: &reviewerPrincipalID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
		}
		return database.GetRequestByIDRow{}, nil, err
	}

	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestID,
		EventKind:        database.RequestEventKindApproved,
		ActorPrincipalID: &reviewerPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusPending),
		ToStatus:         database.RequestStatusApproved,
		ErrorMessage:     nil,
	}); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestID,
		EventKind:        database.RequestEventKindExecutionStarted,
		ActorPrincipalID: &reviewerPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusApproved),
		ToStatus:         database.RequestStatusExecuting,
		ErrorMessage:     nil,
	}); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	s.recordAuditEvent(ctx, &reviewerPrincipalID, "request.approve",
		locked.InventoryItemID, "succeeded", nil,
		map[string]any{"request_id": requestID.String(), "request_kind": locked.Kind})
	s.recordAuditEvent(ctx, &reviewerPrincipalID, "request.execution_started",
		locked.InventoryItemID, "succeeded", nil,
		map[string]any{"request_id": requestID.String(), "request_kind": locked.Kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		locked.RequesterPrincipalID,
		locked.Kind,
	))

	execCtx := context.WithoutCancel(ctx)
	if executeErr := s.executeApprovedRequest(execCtx, locked); executeErr != nil {
		if err := s.markExecutionFailed(execCtx, locked, reviewerPrincipalID, executeErr.Error()); err != nil {
			return database.GetRequestByIDRow{}, nil, err
		}
	} else {
		if err := s.markExecuted(execCtx, locked, reviewerPrincipalID); err != nil {
			return database.GetRequestByIDRow{}, nil, err
		}
	}

	return s.GetRequest(ctx, reviewerPrincipalID, approved.ID)
}

func (s *Service) DenyRequest(
	ctx context.Context,
	reviewerPrincipalID uuid.UUID,
	requestID uuid.UUID,
) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, reviewerPrincipalID)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	locked, err := q.GetRequestForExecution(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotFound
		}
		return database.GetRequestByIDRow{}, nil, err
	}
	if locked.Status != database.RequestStatusPending {
		return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
	}
	if reviewerPrincipalID == locked.RequesterPrincipalID {
		return database.GetRequestByIDRow{}, nil, ErrRequestForbidden
	}
	if !canReviewRequestKind(reviewerPermissions, locked.Kind) {
		return database.GetRequestByIDRow{}, nil, ErrRequestForbidden
	}

	denied, err := q.DenyRequest(ctx, database.DenyRequestParams{
		ID:                  requestID,
		ReviewerPrincipalID: &reviewerPrincipalID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
		}
		return database.GetRequestByIDRow{}, nil, err
	}

	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestID,
		EventKind:        database.RequestEventKindDenied,
		ActorPrincipalID: &reviewerPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusPending),
		ToStatus:         database.RequestStatusDenied,
		ErrorMessage:     nil,
	}); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	s.recordAuditEvent(ctx, &reviewerPrincipalID, "request.deny",
		locked.InventoryItemID, "succeeded", nil,
		map[string]any{"request_id": requestID.String(), "request_kind": locked.Kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		locked.RequesterPrincipalID,
		locked.Kind,
	))

	return s.GetRequest(ctx, reviewerPrincipalID, denied.ID)
}

func (s *Service) CancelRequest(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	requestID uuid.UUID,
) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	locked, err := q.GetRequestForExecution(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotFound
		}
		return database.GetRequestByIDRow{}, nil, err
	}
	if locked.Status != database.RequestStatusPending {
		return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
	}

	if err := s.ensureRequestAccess(ctx, actorPrincipalID, locked.RequesterPrincipalID, locked.Kind); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	canceled, err := q.CancelRequest(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotPending
		}
		return database.GetRequestByIDRow{}, nil, err
	}

	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestID,
		EventKind:        database.RequestEventKindCanceled,
		ActorPrincipalID: &actorPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusPending),
		ToStatus:         database.RequestStatusCanceled,
		ErrorMessage:     nil,
	}); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	s.recordAuditEvent(ctx, &actorPrincipalID, "request.cancel",
		locked.InventoryItemID, "succeeded", nil,
		map[string]any{"request_id": requestID.String(), "request_kind": locked.Kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		locked.RequesterPrincipalID,
		locked.Kind,
	))

	return s.GetRequest(ctx, actorPrincipalID, canceled.ID)
}
