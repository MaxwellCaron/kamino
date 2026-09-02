package personalpods

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/podnetworks"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CloneTarget carries a resolved pod clone target between the two Runtime calls.
type CloneTarget struct {
	Key               string
	NetworkProfileKey string
	LANVNet           string
	DMZVNet           string
	WANBridge         string
	WANSubnet         string
	NetworkMin        int32
	NetworkMax        int32
	CloudInitStorage  string
}

type ProvisionContext struct {
	RootFolderID uuid.UUID
	CloneTarget  CloneTarget
}

type ProvisionRouterRequest struct {
	FolderID      uuid.UUID
	PersonalPodID uuid.UUID
	CloneTarget   CloneTarget
	NetworkNumber int32
}

// Runtime is the coarse seam into handler-owned clone/network/router mechanics.
type Runtime interface {
	ResolveProvisionContext(ctx context.Context) (ProvisionContext, error)
	ProvisionRouter(ctx context.Context, req ProvisionRouterRequest) error
	CleanupFailedProvision(ctx context.Context, folderID uuid.UUID)
}

type store interface {
	GetPersonalPodByUser(ctx context.Context, userPrincipalID uuid.UUID) (database.PersonalPods, error)
	GetPrincipalByID(ctx context.Context, id uuid.UUID) (database.GetPrincipalByIDRow, error)
	InsertPersonalPod(ctx context.Context, params database.InsertPersonalPodParams) (database.InsertPersonalPodRow, error)
}

type inventoryOps interface {
	ChildFolderExists(ctx context.Context, parentID uuid.UUID, name string) (bool, error)
	CreateFolder(ctx context.Context, parentID uuid.UUID, name string) (uuid.UUID, error)
	ReplaceInventoryACL(ctx context.Context, itemID uuid.UUID, entries []inventory.ACLEntryInput) error
	SetFolderDescription(ctx context.Context, id uuid.UUID, description string) error
}

type auditRecorder interface {
	RecordSuccess(ctx context.Context, params audit.EventParams)
	RecordFailure(ctx context.Context, params audit.EventParams, errMsg string)
}

type Service struct {
	enabled   bool
	store     store
	inventory inventoryOps
	audit     auditRecorder
	runtime   Runtime
}

func NewService(
	enabled bool,
	pool *pgxpool.Pool,
	inventoryService *inventory.Service,
	auditService *audit.Service,
	runtime Runtime,
) *Service {
	return newService(enabled, pgStore{pool: pool}, inventoryService, auditService, runtime)
}

func newService(
	enabled bool,
	store store,
	inventoryOps inventoryOps,
	audit auditRecorder,
	runtime Runtime,
) *Service {
	return &Service{
		enabled:   enabled,
		store:     store,
		inventory: inventoryOps,
		audit:     audit,
		runtime:   runtime,
	}
}

func (s *Service) PersonalPodsEnabled() bool {
	return s.enabled
}

func (s *Service) ProvisionPersonalPod(
	ctx context.Context,
	userPrincipalID uuid.UUID,
) (uuid.UUID, error) {
	if !s.enabled {
		return uuid.Nil, newError(KindDisabled, "personal pods are not configured")
	}

	if _, err := s.store.GetPersonalPodByUser(ctx, userPrincipalID); err == nil {
		return uuid.Nil, newError(KindConflict, "personal pod already exists")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, wrapError(KindInternal, "failed to check personal pod", "check existing personal pod", err)
	}

	principal, err := s.store.GetPrincipalByID(ctx, userPrincipalID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, newError(KindNotFound, "principal not found")
		}
		return uuid.Nil, wrapError(KindInternal, "failed to load principal", "load personal pod principal", err)
	}

	username := ""
	if principal.Name != nil {
		username = strings.TrimSpace(*principal.Name)
	}
	if username == "" {
		username = strings.TrimSpace(principal.ExternalID)
	}
	folderName := personalPodFolderName(username)
	if err := names.ValidateFolder(folderName); err != nil {
		return uuid.Nil, newError(KindValidation, err.Error())
	}

	provisionCtx, err := s.runtime.ResolveProvisionContext(ctx)
	if err != nil {
		return uuid.Nil, err
	}

	exists, err := s.inventory.ChildFolderExists(ctx, provisionCtx.RootFolderID, folderName)
	if err != nil {
		return uuid.Nil, mapInventoryError(err)
	}
	if exists {
		return uuid.Nil, newError(KindConflict, "personal pod folder already exists")
	}

	folderID, err := s.inventory.CreateFolder(ctx, provisionCtx.RootFolderID, folderName)
	if err != nil {
		return uuid.Nil, mapInventoryError(err)
	}

	recordFailure := func(failure error) {
		if failure == nil || s.audit == nil {
			return
		}
		s.audit.RecordFailure(ctx, audit.EventParams{
			ActorPrincipalID: &userPrincipalID,
			ActionKind:       "personal_pod.create",
			TargetKind:       "folder",
			InventoryItemID:  &folderID,
		}, failure.Error())
	}

	if err := s.inventory.ReplaceInventoryACL(ctx, folderID, []inventory.ACLEntryInput{{
		PrincipalID: userPrincipalID,
		Effect:      database.InventoryAceEffectAllow,
		Permissions: int64(authorization.FullAccessMask),
	}}); err != nil {
		appErr := wrapError(KindInternal, "failed to apply personal pod permissions", "replace personal pod folder ACL", err)
		recordFailure(appErr)
		s.runtime.CleanupFailedProvision(ctx, folderID)
		return uuid.Nil, appErr
	}

	row, err := s.store.InsertPersonalPod(ctx, database.InsertPersonalPodParams{
		ID:               uuid.New(),
		UserPrincipalID:  userPrincipalID,
		FolderID:         folderID,
		CloneTargetKey:   provisionCtx.CloneTarget.Key,
		MinNetworkNumber: provisionCtx.CloneTarget.NetworkMin,
		MaxNetworkNumber: provisionCtx.CloneTarget.NetworkMax,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		appErr := newError(KindConflict, "no personal pod network numbers available")
		recordFailure(appErr)
		s.runtime.CleanupFailedProvision(ctx, folderID)
		return uuid.Nil, appErr
	}
	if err != nil {
		appErr := wrapError(KindInternal, "failed to reserve personal pod network number", "insert personal pod network allocation", err)
		recordFailure(appErr)
		s.runtime.CleanupFailedProvision(ctx, folderID)
		return uuid.Nil, appErr
	}

	vnetName := provisionCtx.CloneTarget.LANVNet
	if err := s.inventory.SetFolderDescription(
		ctx,
		folderID,
		personalPodFolderDescriptionWithTag(vnetName, row.NetworkNumber),
	); err != nil {
		appErr := wrapError(KindInternal, "failed to set personal pod folder guidance", "set personal pod folder description", err)
		recordFailure(appErr)
		s.runtime.CleanupFailedProvision(ctx, folderID)
		return uuid.Nil, appErr
	}

	if err := s.runtime.ProvisionRouter(ctx, ProvisionRouterRequest{
		FolderID:      folderID,
		PersonalPodID: row.ID,
		CloneTarget:   provisionCtx.CloneTarget,
		NetworkNumber: row.NetworkNumber,
	}); err != nil {
		recordFailure(err)
		return uuid.Nil, err
	}

	if s.audit != nil {
		s.audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &userPrincipalID,
			ActionKind:       "personal_pod.create",
			TargetKind:       "folder",
			InventoryItemID:  &folderID,
			Metadata: map[string]any{
				"network_number": row.NetworkNumber,
				"vnet":           vnetName,
			},
		})
	}

	return folderID, nil
}

func mapInventoryError(err error) *Error {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		return newError(KindNotFound, err.Error())
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, inventory.ErrInventoryFolderDepthExceeded),
		errors.Is(err, inventory.ErrInventoryInvalidFolderLimit),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithAlnum),
		errors.Is(err, names.ErrInvalidCharacters):
		return newError(KindValidation, err.Error())
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict),
		errors.Is(err, inventory.ErrInventoryFolderLimitExceeded):
		return newError(KindConflict, err.Error())
	default:
		return newError(KindInternal, "inventory mutation failed")
	}
}

type pgStore struct {
	pool *pgxpool.Pool
}

func (s pgStore) GetPersonalPodByUser(ctx context.Context, userPrincipalID uuid.UUID) (database.PersonalPods, error) {
	return database.New(s.pool).GetPersonalPodByUser(ctx, userPrincipalID)
}

func (s pgStore) GetPrincipalByID(ctx context.Context, id uuid.UUID) (database.GetPrincipalByIDRow, error) {
	return database.New(s.pool).GetPrincipalByID(ctx, id)
}

// InsertPersonalPod holds the pod-network allocation lock so concurrent provisions can't race for a number.
func (s pgStore) InsertPersonalPod(
	ctx context.Context,
	params database.InsertPersonalPodParams,
) (database.InsertPersonalPodRow, error) {
	var row database.InsertPersonalPodRow
	err := podnetworks.WithPodNetworkAllocation(ctx, s.pool, func(ctx context.Context, tx pgx.Tx) error {
		q := database.New(tx)
		var err error
		row, err = q.InsertPersonalPod(ctx, params)
		if err != nil {
			return err
		}

		// PostgreSQL cannot reliably update a row inserted by a sibling data-modifying CTE.
		linkedRows, err := q.LinkPersonalPodNetworkAllocation(ctx, database.LinkPersonalPodNetworkAllocationParams{
			PersonalPodID: &row.ID,
			AllocationID:  row.AllocationID,
			FolderID:      row.FolderID,
		})
		if err != nil {
			return fmt.Errorf("link personal pod network allocation: %w", err)
		}
		if linkedRows != 1 {
			return fmt.Errorf("linked %d personal pod network allocations", linkedRows)
		}
		return nil
	})
	return row, err
}

func personalPodFolderDescription(vnetName string) string {
	vnetName = strings.TrimSpace(vnetName)
	return fmt.Sprintf(
		"To add another VM, choose Create VM from this folder and attach its network interface to VNet %s. You can confirm the VNet from the router VM dashboard.",
		vnetName,
	)
}

func personalPodFolderDescriptionWithTag(vnetName string, vlanTag int32) string {
	vnetName = strings.TrimSpace(vnetName)
	return fmt.Sprintf(
		"To add another VM, choose Create VM from this folder and attach its network interface to VNet %s with VLAN tag %d. Both are pre-filled and locked when you create or edit hardware from this folder.",
		vnetName,
		vlanTag,
	)
}

func personalPodFolderName(username string) string {
	trimmed := strings.TrimSpace(username)
	var builder strings.Builder
	lastDash := false

	for _, r := range trimmed {
		allowed := unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-'
		if allowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if lastDash {
			continue
		}
		builder.WriteByte('-')
		lastDash = true
	}

	name := strings.Trim(builder.String(), "-")
	if name == "" || !unicode.IsLetter(rune(name[0])) {
		name = "user-" + name
	}
	if len(name) > 63 {
		name = name[:63]
		name = strings.TrimRight(name, "-")
	}
	if name == "" {
		return "user-"
	}

	return name
}
