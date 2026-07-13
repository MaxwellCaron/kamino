package requests

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TablePageResult is the page/rows/search response shape used by data
// tables for audit/request lists: a bounded slice of items plus the
// filtered total row count.
type TablePageResult[T any] struct {
	Items []T   `json:"items"`
	Total int32 `json:"total"`
	Page  int32 `json:"page"`
	Rows  int32 `json:"rows"`
}

const (
	RequestKindInventoryVMPower            = "inventory.vm.power"
	RequestKindInventoryVMSnapshotCreate   = "inventory.vm.snapshot.create"
	RequestKindInventoryVMSnapshotRollback = "inventory.vm.snapshot.rollback"
	RequestKindPersonalPodCreate           = "personal_pod.create"

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
	ErrRequestPersonalPodExists  = errors.New("personal pod already exists")
	ErrRequestDuplicatePending   = errors.New("a pending personal pod request already exists")
	ErrRequestActionInProgress   = errors.New("another action is already in progress for this VM")
)

type vmActionClaimer interface {
	Claim(ctx context.Context, itemID uuid.UUID, action string, actorPrincipalID uuid.UUID, detail string) error
	Release(ctx context.Context, itemID uuid.UUID) error
}

type PersonalPodProvisioner interface {
	PersonalPodsEnabled() bool
	ProvisionPersonalPod(ctx context.Context, userPrincipalID uuid.UUID) error
}

type Service struct {
	db           *pgxpool.Pool
	authz        *authorization.Service
	inventory    *inventory.Service
	px           *proxmox.Client
	actions      *vmactions.Executor
	notifier     *Notifier
	audit        *audit.Service
	personalPods PersonalPodProvisioner
	vmClaims     vmActionClaimer
}

type vmTarget struct {
	ItemID       uuid.UUID
	Node         string
	VMID         int
	UpstreamUUID uuid.UUID
	GuestType    proxmox.GuestType
}

func NewService(
	db *pgxpool.Pool,
	authz *authorization.Service,
	inventoryService *inventory.Service,
	px *proxmox.Client,
	actions *vmactions.Executor,
	notifier *Notifier,
	auditService *audit.Service,
	personalPods PersonalPodProvisioner,
	vmClaims vmActionClaimer,
) *Service {
	return &Service{
		db:           db,
		authz:        authz,
		inventory:    inventoryService,
		px:           px,
		actions:      actions,
		notifier:     notifier,
		audit:        auditService,
		personalPods: personalPods,
		vmClaims:     vmClaims,
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

func (s *Service) recordAuditEvent(
	ctx context.Context,
	actorID *uuid.UUID,
	actionKind string,
	inventoryItemID *uuid.UUID,
	status string,
	errMsg *string,
	metadata map[string]any,
) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, audit.EventParams{
		ActorPrincipalID: actorID,
		ActionKind:       actionKind,
		TargetKind:       "request",
		InventoryItemID:  inventoryItemID,
		Status:           status,
		ErrorMessage:     errMsg,
		Metadata:         metadata,
	})
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

func (s *Service) FailStaleExecutingRequests(ctx context.Context) ([]uuid.UUID, error) {
	stale, err := s.ListStaleExecutingRequests(ctx, StaleExecutingThreshold)
	if err != nil {
		return nil, err
	}

	failed := make([]uuid.UUID, 0, len(stale))
	for _, request := range stale {
		errorMessage := "request was stranded in executing state (likely a prior process died mid-execution)"
		if err := s.markExecutionFailedRecord(
			ctx,
			request.ID,
			request.RequesterPrincipalID,
			request.Kind,
			nil,
			errorMessage,
		); err != nil {
			log.Printf("failed to fence stale executing request %s: %v", request.ID, err)
			continue
		}
		failed = append(failed, request.ID)
	}

	return failed, nil
}
