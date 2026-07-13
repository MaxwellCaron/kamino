package requests

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type TablePageParams struct {
	Page   int32
	Rows   int32
	Search string
}

func normalizeTablePage(params TablePageParams) (page int32, rows int32, offset int32) {
	page = params.Page
	if page <= 0 {
		page = 1
	}
	rows = params.Rows
	if rows <= 0 {
		rows = 25
	}
	offset = (page - 1) * rows
	return page, rows, offset
}

// ListPendingRequestsTable returns the manager pending-requests table page,
// scoped to request kinds the actor may review.
func (s *Service) ListPendingRequestsTable(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	params TablePageParams,
) (TablePageResult[database.ListPendingRequestsFilteredRow], error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return TablePageResult[database.ListPendingRequestsFilteredRow]{}, err
	}

	page, rows, offset := normalizeTablePage(params)
	kinds := reviewableRequestKinds(reviewerPermissions)

	items, err := database.New(s.db).ListPendingRequestsFiltered(ctx, database.ListPendingRequestsFilteredParams{
		Kinds:     kinds,
		Search:    params.Search,
		Rows:      rows,
		RowOffset: offset,
	})
	if err != nil {
		return TablePageResult[database.ListPendingRequestsFilteredRow]{}, err
	}

	total, err := database.New(s.db).CountPendingRequestsFiltered(ctx, database.CountPendingRequestsFilteredParams{
		Kinds:  kinds,
		Search: params.Search,
	})
	if err != nil {
		return TablePageResult[database.ListPendingRequestsFilteredRow]{}, err
	}

	return TablePageResult[database.ListPendingRequestsFilteredRow]{
		Items: items,
		Total: total,
		Page:  page,
		Rows:  rows,
	}, nil
}

// ListCompletedRequestsTable returns the manager completed-requests table
// page, scoped to request kinds the actor may review.
func (s *Service) ListCompletedRequestsTable(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	params TablePageParams,
) (TablePageResult[database.ListCompletedRequestsForKindsFilteredRow], error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return TablePageResult[database.ListCompletedRequestsForKindsFilteredRow]{}, err
	}

	page, rows, offset := normalizeTablePage(params)
	kinds := reviewableRequestKinds(reviewerPermissions)

	items, err := database.New(s.db).ListCompletedRequestsForKindsFiltered(ctx, database.ListCompletedRequestsForKindsFilteredParams{
		Kinds:     kinds,
		Search:    params.Search,
		Rows:      rows,
		RowOffset: offset,
	})
	if err != nil {
		return TablePageResult[database.ListCompletedRequestsForKindsFilteredRow]{}, err
	}

	total, err := database.New(s.db).CountCompletedRequestsForKindsFiltered(ctx, database.CountCompletedRequestsForKindsFilteredParams{
		Kinds:  kinds,
		Search: params.Search,
	})
	if err != nil {
		return TablePageResult[database.ListCompletedRequestsForKindsFilteredRow]{}, err
	}

	return TablePageResult[database.ListCompletedRequestsForKindsFilteredRow]{
		Items: items,
		Total: total,
		Page:  page,
		Rows:  rows,
	}, nil
}

// ListPendingRequestsByRequesterTable returns the requester's own pending
// requests table page.
func (s *Service) ListPendingRequestsByRequesterTable(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	params TablePageParams,
) (TablePageResult[database.ListPendingRequestsByRequesterFilteredRow], error) {
	page, rows, offset := normalizeTablePage(params)

	items, err := database.New(s.db).ListPendingRequestsByRequesterFiltered(ctx, database.ListPendingRequestsByRequesterFilteredParams{
		RequesterPrincipalID: requesterPrincipalID,
		Search:               params.Search,
		Rows:                 rows,
		RowOffset:            offset,
	})
	if err != nil {
		return TablePageResult[database.ListPendingRequestsByRequesterFilteredRow]{}, err
	}

	total, err := database.New(s.db).CountPendingRequestsByRequesterFiltered(ctx, database.CountPendingRequestsByRequesterFilteredParams{
		RequesterPrincipalID: requesterPrincipalID,
		Search:               params.Search,
	})
	if err != nil {
		return TablePageResult[database.ListPendingRequestsByRequesterFilteredRow]{}, err
	}

	return TablePageResult[database.ListPendingRequestsByRequesterFilteredRow]{
		Items: items,
		Total: total,
		Page:  page,
		Rows:  rows,
	}, nil
}

// ListRequestHistoryByRequesterTable returns the requester's own request
// history table page.
func (s *Service) ListRequestHistoryByRequesterTable(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	params TablePageParams,
) (TablePageResult[database.ListRequestHistoryByRequesterFilteredRow], error) {
	page, rows, offset := normalizeTablePage(params)

	items, err := database.New(s.db).ListRequestHistoryByRequesterFiltered(ctx, database.ListRequestHistoryByRequesterFilteredParams{
		RequesterPrincipalID: requesterPrincipalID,
		Search:               params.Search,
		Rows:                 rows,
		RowOffset:            offset,
	})
	if err != nil {
		return TablePageResult[database.ListRequestHistoryByRequesterFilteredRow]{}, err
	}

	total, err := database.New(s.db).CountRequestHistoryByRequesterFiltered(ctx, database.CountRequestHistoryByRequesterFilteredParams{
		RequesterPrincipalID: requesterPrincipalID,
		Search:               params.Search,
	})
	if err != nil {
		return TablePageResult[database.ListRequestHistoryByRequesterFilteredRow]{}, err
	}

	return TablePageResult[database.ListRequestHistoryByRequesterFilteredRow]{
		Items: items,
		Total: total,
		Page:  page,
		Rows:  rows,
	}, nil
}

func reviewableRequestKinds(
	perms authorization.EffectiveManagementPermissions,
) []string {
	if !perms.Has(authorization.ManagementPermissionManager) {
		return nil
	}

	return []string{
		RequestKindInventoryVMPower,
		RequestKindInventoryVMSnapshotCreate,
		RequestKindInventoryVMSnapshotRollback,
		RequestKindPersonalPodCreate,
	}
}

func (s *Service) GetRequest(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	requestID uuid.UUID,
) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error) {
	row, err := database.New(s.db).GetRequestByID(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.GetRequestByIDRow{}, nil, ErrRequestNotFound
		}
		return database.GetRequestByIDRow{}, nil, err
	}

	if err := s.ensureRequestAccess(ctx, actorPrincipalID, row.RequesterPrincipalID, row.Kind); err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	events, err := database.New(s.db).ListRequestEventsByRequestID(ctx, requestID)
	if err != nil {
		return database.GetRequestByIDRow{}, nil, err
	}

	return row, events, nil
}
