package requests

import (
	"context"
	"errors"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) executeApprovedRequest(
	ctx context.Context,
	requestRow database.GetRequestForExecutionRow,
) error {
	if s.px == nil || s.inventory == nil || s.authz == nil {
		return ErrRequestServiceUnavailable
	}
	if s.actions == nil {
		return ErrRequestServiceUnavailable
	}
	if requestRow.Kind == RequestKindPersonalPodCreate {
		if s.personalPods == nil || !s.personalPods.PersonalPodsEnabled() {
			return ErrRequestServiceUnavailable
		}
		return s.personalPods.ProvisionPersonalPod(ctx, requestRow.RequesterPrincipalID)
	}
	if requestRow.InventoryItemID == nil {
		return ErrRequestMissingPayload
	}

	itemID := *requestRow.InventoryItemID
	required, err := requiredPermissionForRequestKind(requestRow.Kind)
	if err != nil {
		return err
	}

	perms, err := s.authz.EffectivePermissions(ctx, requestRow.RequesterPrincipalID, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRequestStale
		}
		return err
	}
	if !perms.Has(required) && !perms.CanRequest(required) {
		return ErrRequestStale
	}

	target, err := s.resolveVMTarget(ctx, itemID)
	if err != nil {
		return err
	}

	switch requestRow.Kind {
	case RequestKindInventoryVMPower:
		if !requestRow.PowerAction.Valid {
			return ErrRequestMissingPayload
		}
		return s.executePowerAction(ctx, target, requestRow.PowerAction.InventoryRequestPowerAction)
	case RequestKindInventoryVMSnapshotCreate:
		if requestRow.SnapshotName == nil || strings.TrimSpace(*requestRow.SnapshotName) == "" {
			return ErrRequestMissingPayload
		}
		return s.executeCreateSnapshot(ctx, target, *requestRow.SnapshotName)
	case RequestKindInventoryVMSnapshotRollback:
		if requestRow.SnapshotName == nil || strings.TrimSpace(*requestRow.SnapshotName) == "" {
			return ErrRequestMissingPayload
		}
		return s.executeRollbackSnapshot(ctx, target, *requestRow.SnapshotName)
	default:
		return ErrRequestUnsupportedKind
	}
}

func (s *Service) resolveVMTarget(ctx context.Context, itemID uuid.UUID) (vmTarget, error) {
	record, err := s.authz.GetVMRecord(ctx, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return vmTarget{}, ErrRequestStale
		}
		return vmTarget{}, err
	}

	identity, err := s.px.GetVMIdentity(ctx, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid))
	if err != nil {
		switch {
		case errors.Is(err, proxmox.ErrVMIdentityNotConfigured),
			errors.Is(err, proxmox.ErrVMIdentityInvalid):
			return vmTarget{}, ErrRequestStale
		default:
			return vmTarget{}, err
		}
	}
	if identity.UpstreamUUID != record.UpstreamUUID {
		return vmTarget{}, ErrRequestStale
	}

	return vmTarget{
		ItemID:       record.InventoryItemID,
		Node:         record.Node,
		VMID:         int(record.Vmid),
		UpstreamUUID: record.UpstreamUUID,
		GuestType:    proxmox.GuestType(record.GuestType),
	}, nil
}

func (s *Service) executePowerAction(
	ctx context.Context,
	target vmTarget,
	action database.InventoryRequestPowerAction,
) error {
	return s.actions.PowerAction(ctx, toActionTarget(target), powerActionForRequest(action))
}

func (s *Service) executeCreateSnapshot(
	ctx context.Context,
	target vmTarget,
	snapshotName string,
) error {
	return s.actions.CreateSnapshot(
		ctx,
		toActionTarget(target),
		strings.TrimSpace(snapshotName),
		"",
		false,
	)
}

func (s *Service) executeRollbackSnapshot(
	ctx context.Context,
	target vmTarget,
	snapshotName string,
) error {
	snapshotName = strings.TrimSpace(snapshotName)
	snapshots, err := s.px.GetSnapshots(ctx, target.GuestType, target.Node, target.VMID)
	if err != nil {
		return err
	}

	found := false
	for _, snapshot := range snapshots {
		if snapshot.Name == snapshotName {
			found = true
			break
		}
	}
	if !found {
		return ErrRequestStale
	}

	return s.actions.RollbackSnapshot(ctx, toActionTarget(target), snapshotName)
}

func (s *Service) markExecuted(
	ctx context.Context,
	requestRow database.GetRequestForExecutionRow,
	actorPrincipalID uuid.UUID,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if _, err := q.MarkRequestExecuted(ctx, requestRow.ID); err != nil {
		return err
	}
	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestRow.ID,
		EventKind:        database.RequestEventKindExecuted,
		ActorPrincipalID: &actorPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusExecuting),
		ToStatus:         database.RequestStatusExecuted,
		ErrorMessage:     nil,
	}); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.recordAuditEvent(ctx, &actorPrincipalID, "request.executed",
		requestRow.InventoryItemID, "succeeded", nil,
		map[string]any{"request_id": requestRow.ID.String(), "request_kind": requestRow.Kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestRow.ID,
		requestRow.RequesterPrincipalID,
		requestRow.Kind,
	))

	return nil
}

func (s *Service) markExecutionFailed(
	ctx context.Context,
	requestRow database.GetRequestForExecutionRow,
	actorPrincipalID uuid.UUID,
	errorMessage string,
) error {
	return s.markExecutionFailedRecord(
		ctx,
		requestRow.ID,
		requestRow.RequesterPrincipalID,
		requestRow.Kind,
		&actorPrincipalID,
		errorMessage,
	)
}

func (s *Service) markExecutionFailedRecord(
	ctx context.Context,
	requestID uuid.UUID,
	requesterPrincipalID uuid.UUID,
	kind string,
	actorPrincipalID *uuid.UUID,
	errorMessage string,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if _, err := q.MarkRequestExecutionFailed(ctx, database.MarkRequestExecutionFailedParams{
		ID:             requestID,
		ExecutionError: &errorMessage,
	}); err != nil {
		return err
	}
	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestID,
		EventKind:        database.RequestEventKindExecutionFailed,
		ActorPrincipalID: actorPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusExecuting),
		ToStatus:         database.RequestStatusExecutionFailed,
		ErrorMessage:     &errorMessage,
	}); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.recordAuditEvent(ctx, actorPrincipalID, "request.execution_failed",
		nil, "failed", &errorMessage,
		map[string]any{"request_id": requestID.String(), "request_kind": kind})

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		requesterPrincipalID,
		kind,
	))

	return nil
}
