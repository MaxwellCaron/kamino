package requests

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultPageSize = 50
	maxPageSize     = 100
)

type RequestCursor struct {
	UpdatedAt time.Time `json:"u"`
	CreatedAt time.Time `json:"c"`
	ID        uuid.UUID `json:"i"`
}

type PaginatedResult[T any] struct {
	Items      []T            `json:"items"`
	NextCursor *RequestCursor `json:"next_cursor,omitempty"`
}

func EncodeCursor(cursor RequestCursor) string {
	b, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(b)
}

func DecodeCursor(raw string) (RequestCursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return RequestCursor{}, err
	}
	var cursor RequestCursor
	if err := json.Unmarshal(b, &cursor); err != nil {
		return RequestCursor{}, err
	}
	return cursor, nil
}

func ParseLimit(raw string) (int32, error) {
	if raw == "" {
		return defaultPageSize, nil
	}
	var n int32
	_, err := fmt.Sscanf(raw, "%d", &n)
	if err != nil {
		return 0, errors.New("invalid limit")
	}
	if raw != fmt.Sprintf("%d", n) {
		return 0, errors.New("invalid limit")
	}
	if n < 1 {
		return 0, errors.New("limit must be at least 1")
	}
	if n > maxPageSize {
		n = maxPageSize
	}
	return n, nil
}

const (
	RequestKindInventoryVMPower            = "inventory.vm.power"
	RequestKindInventoryVMSnapshotCreate   = "inventory.vm.snapshot.create"
	RequestKindInventoryVMSnapshotRollback = "inventory.vm.snapshot.rollback"

	maxPendingRequestsPerUser = 3
	StaleExecutingThreshold   = 15 * time.Minute
)

var (
	ErrRequestNotFound           = errors.New("request not found")
	ErrRequestNotPending         = errors.New("request is not pending")
	ErrRequestForbidden          = errors.New("forbidden")
	ErrRequestDirectExecution    = errors.New("action must be executed directly")
	ErrRequestInvalidPowerAction = errors.New("invalid power action")
	ErrRequestInvalidSnapshot    = errors.New("snapshot name is required")
	ErrRequestUnsupportedKind    = errors.New("unsupported request kind")
	ErrRequestMissingPayload     = errors.New("request payload is invalid")
	ErrRequestStale              = errors.New("request target is stale")
	ErrRequestServiceUnavailable = errors.New("request execution service unavailable")
	ErrRequestLimitExceeded      = errors.New("maximum pending request limit reached")
)

type Service struct {
	db        *pgxpool.Pool
	authz     *authorization.Service
	inventory *inventory.Service
	px        *proxmox.Client
	actions   *vmactions.Executor
	notifier  *Notifier
}

type vmTarget struct {
	ItemID       uuid.UUID
	Node         string
	VMID         int
	UpstreamUUID uuid.UUID
}

func NewService(
	db *pgxpool.Pool,
	authz *authorization.Service,
	inventoryService *inventory.Service,
	px *proxmox.Client,
	actions *vmactions.Executor,
	notifier *Notifier,
) *Service {
	return &Service{
		db:        db,
		authz:     authz,
		inventory: inventoryService,
		px:        px,
		actions:   actions,
		notifier:  notifier,
	}
}

func (s *Service) Subscribe() (<-chan Event, func()) {
	return s.notifier.Subscribe()
}

func (s *Service) EnsureQueueAccess(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
) error {
	_, err := s.reviewerPermissions(ctx, actorPrincipalID)
	return err
}

func (s *Service) notify(ctx context.Context, exec database.DBTX, events ...Event) {
	if s.notifier == nil {
		return
	}

	var target database.DBTX = s.db
	if exec != nil {
		target = exec
	}

	for _, event := range events {
		if err := s.notifier.Notify(ctx, target, event); err != nil {
			log.Printf("request notify failed: %v", err)
		}
	}
}

func (s *Service) notifyTx(ctx context.Context, tx pgx.Tx, event Event) {
	s.notify(ctx, tx, event)
}

func (s *Service) ListPendingRequests(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
) ([]database.ListPendingRequestsRow, error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return nil, err
	}

	rows, err := database.New(s.db).ListPendingRequests(ctx)
	if err != nil {
		return nil, err
	}

	filtered := make([]database.ListPendingRequestsRow, 0, len(rows))
	for _, row := range rows {
		if canReviewRequestKind(reviewerPermissions, row.Kind) {
			filtered = append(filtered, row)
		}
	}

	return filtered, nil
}

func (s *Service) ListCompletedRequests(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
) ([]database.ListCompletedRequestsRow, error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return nil, err
	}

	rows, err := database.New(s.db).ListCompletedRequests(ctx)
	if err != nil {
		return nil, err
	}

	filtered := make([]database.ListCompletedRequestsRow, 0, len(rows))
	for _, row := range rows {
		if canReviewRequestKind(reviewerPermissions, row.Kind) {
			filtered = append(filtered, row)
		}
	}

	return filtered, nil
}

func (s *Service) ListStaleExecutingRequests(
	ctx context.Context,
	threshold time.Duration,
) ([]database.Requests, error) {
	cutoff := pgtype.Timestamptz{
		Time:  time.Now().Add(-threshold),
		Valid: true,
	}

	return database.New(s.db).ListStaleExecutingRequests(ctx, cutoff)
}

func (s *Service) ListPendingRequestsByRequester(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
) ([]database.ListPendingRequestsByRequesterRow, error) {
	return database.New(s.db).ListPendingRequestsByRequester(
		ctx,
		requesterPrincipalID,
	)
}

func (s *Service) ListRequestHistoryByRequester(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
) ([]database.ListRequestHistoryByRequesterRow, error) {
	return database.New(s.db).ListRequestHistoryByRequester(
		ctx,
		requesterPrincipalID,
	)
}

func (s *Service) ListCompletedRequestsPaginated(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	pageSize int32,
	cursor *RequestCursor,
) (PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow], error) {
	reviewerPermissions, err := s.reviewerPermissions(ctx, actorPrincipalID)
	if err != nil {
		return PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow]{}, err
	}

	params := database.ListCompletedRequestsForKindsPaginatedParams{
		Kinds:    reviewableRequestKinds(reviewerPermissions),
		PageSize: pageSize + 1,
	}
	if cursor != nil {
		params.CursorUpdatedAt = pgtype.Timestamptz{Time: cursor.UpdatedAt, Valid: true}
		params.CursorCreatedAt = pgtype.Timestamptz{Time: cursor.CreatedAt, Valid: true}
		params.CursorID = cursor.ID
	}

	rows, err := database.New(s.db).ListCompletedRequestsForKindsPaginated(ctx, params)
	if err != nil {
		return PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow]{}, err
	}

	return paginateCompletedForKinds(rows, pageSize), nil
}

func (s *Service) ListRequestHistoryByRequesterPaginated(
	ctx context.Context,
	requesterPrincipalID uuid.UUID,
	pageSize int32,
	cursor *RequestCursor,
) (PaginatedResult[database.ListRequestHistoryByRequesterPaginatedRow], error) {
	params := database.ListRequestHistoryByRequesterPaginatedParams{
		RequesterPrincipalID: requesterPrincipalID,
		PageSize:             pageSize + 1,
	}
	if cursor != nil {
		params.CursorUpdatedAt = pgtype.Timestamptz{Time: cursor.UpdatedAt, Valid: true}
		params.CursorCreatedAt = pgtype.Timestamptz{Time: cursor.CreatedAt, Valid: true}
		params.CursorID = cursor.ID
	}

	rows, err := database.New(s.db).ListRequestHistoryByRequesterPaginated(ctx, params)
	if err != nil {
		return PaginatedResult[database.ListRequestHistoryByRequesterPaginatedRow]{}, err
	}

	return paginateRequesterHistory(rows, pageSize), nil
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
	}
}

func paginateCompletedForKinds(
	rows []database.ListCompletedRequestsForKindsPaginatedRow,
	pageSize int32,
) PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow] {
	if int32(len(rows)) <= pageSize {
		return PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow]{
			Items: rows,
		}
	}

	last := rows[pageSize-1]
	return PaginatedResult[database.ListCompletedRequestsForKindsPaginatedRow]{
		Items:      rows[:pageSize],
		NextCursor: cursorFromTimes(last.UpdatedAt, last.CreatedAt, last.ID),
	}
}

func paginateRequesterHistory(
	rows []database.ListRequestHistoryByRequesterPaginatedRow,
	pageSize int32,
) PaginatedResult[database.ListRequestHistoryByRequesterPaginatedRow] {
	if int32(len(rows)) <= pageSize {
		return PaginatedResult[database.ListRequestHistoryByRequesterPaginatedRow]{
			Items: rows,
		}
	}

	last := rows[pageSize-1]
	return PaginatedResult[database.ListRequestHistoryByRequesterPaginatedRow]{
		Items:      rows[:pageSize],
		NextCursor: cursorFromTimes(last.UpdatedAt, last.CreatedAt, last.ID),
	}
}

func cursorFromTimes(
	updatedAt pgtype.Timestamptz,
	createdAt pgtype.Timestamptz,
	id uuid.UUID,
) *RequestCursor {
	return &RequestCursor{
		UpdatedAt: updatedAt.Time,
		CreatedAt: createdAt.Time,
		ID:        id,
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
	if !canReviewRequestKind(reviewerPermissions, locked.Kind) {
		return database.GetRequestByIDRow{}, nil, ErrRequestForbidden
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

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		locked.RequesterPrincipalID,
		locked.Kind,
	))

	if executeErr := s.executeApprovedRequest(ctx, locked); executeErr != nil {
		if err := s.markExecutionFailed(ctx, locked, reviewerPrincipalID, executeErr.Error()); err != nil {
			return database.GetRequestByIDRow{}, nil, err
		}
	} else {
		if err := s.markExecuted(ctx, locked, reviewerPrincipalID); err != nil {
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

	s.notify(ctx, nil, requestChangedEvent(
		requestID,
		locked.RequesterPrincipalID,
		locked.Kind,
	))

	return s.GetRequest(ctx, actorPrincipalID, canceled.ID)
}

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
		RequestKindInventoryVMSnapshotRollback:
		return true
	default:
		return false
	}
}

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

	identity, err := s.px.GetVMIdentity(ctx, record.Node, int(record.Vmid))
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
	snapshots, err := s.px.GetSnapshots(ctx, target.Node, target.VMID)
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
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if _, err := q.MarkRequestExecutionFailed(ctx, database.MarkRequestExecutionFailedParams{
		ID:             requestRow.ID,
		ExecutionError: &errorMessage,
	}); err != nil {
		return err
	}
	if _, err := q.CreateRequestEvent(ctx, database.CreateRequestEventParams{
		RequestID:        requestRow.ID,
		EventKind:        database.RequestEventKindExecutionFailed,
		ActorPrincipalID: &actorPrincipalID,
		FromStatus:       validRequestStatus(database.RequestStatusExecuting),
		ToStatus:         database.RequestStatusExecutionFailed,
		ErrorMessage:     &errorMessage,
	}); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.notify(ctx, nil, requestChangedEvent(
		requestRow.ID,
		requestRow.RequesterPrincipalID,
		requestRow.Kind,
	))

	return nil
}

func requestChangedEvent(
	requestID uuid.UUID,
	requesterPrincipalID uuid.UUID,
	kind string,
) Event {
	return Event{
		RequestID:            &requestID,
		RequesterPrincipalID: &requesterPrincipalID,
		Kind:                 kind,
	}
}

func requiredPermissionForRequestKind(kind string) (authorization.Mask, error) {
	switch kind {
	case RequestKindInventoryVMPower:
		return authorization.PowerVM, nil
	case RequestKindInventoryVMSnapshotCreate, RequestKindInventoryVMSnapshotRollback:
		return authorization.SnapshotVM, nil
	default:
		return 0, ErrRequestUnsupportedKind
	}
}

func isValidPowerAction(action database.InventoryRequestPowerAction) bool {
	switch action {
	case database.InventoryRequestPowerActionPowerOn,
		database.InventoryRequestPowerActionShutdown,
		database.InventoryRequestPowerActionReboot,
		database.InventoryRequestPowerActionStop:
		return true
	default:
		return false
	}
}

func invalidPowerAction() database.NullInventoryRequestPowerAction {
	return database.NullInventoryRequestPowerAction{}
}

func validPowerAction(action database.InventoryRequestPowerAction) database.NullInventoryRequestPowerAction {
	return database.NullInventoryRequestPowerAction{
		InventoryRequestPowerAction: action,
		Valid:                       true,
	}
}

func invalidRequestStatus() database.NullRequestStatus {
	return database.NullRequestStatus{}
}

func validRequestStatus(status database.RequestStatus) database.NullRequestStatus {
	return database.NullRequestStatus{
		RequestStatus: status,
		Valid:         true,
	}
}

func powerActionForRequest(action database.InventoryRequestPowerAction) vmactions.PowerAction {
	switch action {
	case database.InventoryRequestPowerActionPowerOn:
		return vmactions.PowerActionStart
	case database.InventoryRequestPowerActionShutdown:
		return vmactions.PowerActionShutdown
	case database.InventoryRequestPowerActionReboot:
		return vmactions.PowerActionReboot
	case database.InventoryRequestPowerActionStop:
		return vmactions.PowerActionStop
	default:
		return ""
	}
}

func toActionTarget(target vmTarget) vmactions.Target {
	return vmactions.Target{
		ItemID: target.ItemID,
		Node:   target.Node,
		VMID:   target.VMID,
	}
}
