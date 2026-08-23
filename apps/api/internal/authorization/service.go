package authorization

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrForbidden                   = errors.New("forbidden")
	ErrManagementACLRequiresGroup  = errors.New("management ACL requires a group principal")
	ErrUnknownManagementPermission = errors.New("unknown management permission")
)

// dbtx is the seam Service uses to talk to the database
type dbtx interface {
	database.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

type Service struct {
	db                          dbtx
	protectedManagementGroupIDs map[uuid.UUID]struct{}
}

type VMRecord struct {
	InventoryItemID uuid.UUID
	Node            string
	Vmid            int32
	UpstreamUUID    uuid.UUID
	GuestType       string
}

type VMItemAccess struct {
	Allowed bool
	HasVM   bool
	Record  VMRecord
}

func hasVMFlag(value any) bool {
	hasVM, ok := value.(bool)
	return ok && hasVM
}

func NewService(db dbtx, protectedManagementGroupIDs []uuid.UUID) *Service {
	protectedIDs := make(map[uuid.UUID]struct{}, len(protectedManagementGroupIDs))
	for _, principalID := range protectedManagementGroupIDs {
		if principalID == uuid.Nil {
			continue
		}
		protectedIDs[principalID] = struct{}{}
	}

	return &Service{
		db:                          db,
		protectedManagementGroupIDs: protectedIDs,
	}
}

func (s *Service) EffectivePermissions(
	ctx context.Context,
	principalID uuid.UUID,
	itemID uuid.UUID,
) (EffectivePermissions, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return EffectivePermissions{}, err
	}
	if isAdmin {
		row, err := database.New(s.db).GetInventoryItemByID(ctx, itemID)
		if err != nil {
			return EffectivePermissions{}, err
		}

		return EffectivePermissionsForTargetKind(
			targetKindForInventoryItemKind(row.Kind),
			FullAccessMask,
			0,
		), nil
	}

	row, err := database.New(s.db).GetInventoryItemWithPermissions(ctx, database.GetInventoryItemWithPermissionsParams{
		PrincipalID:     principalID,
		InventoryItemID: itemID,
	})
	if err != nil {
		return EffectivePermissions{}, err
	}

	return EffectivePermissionsForTargetKind(
		targetKindForInventoryItemKind(row.Kind),
		Mask(row.AllowedMask),
		Mask(row.DeniedMask),
	), nil
}

func (s *Service) Has(
	ctx context.Context,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required Mask,
) (bool, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	allowed, err := database.New(s.db).HasInventoryPermission(ctx, database.HasInventoryPermissionParams{
		PrincipalID:     principalID,
		InventoryItemID: itemID,
		RequiredMask:    int64(required),
	})
	if err != nil {
		return false, err
	}

	return allowed, nil
}

func (s *Service) Require(
	ctx context.Context,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required Mask,
) error {
	allowed, err := s.Has(ctx, principalID, itemID, required)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrForbidden
	}

	return nil
}

// HasAny reports whether the principal holds the required mask on at least
// one inventory folder anywhere in the tree. This backs metadata endpoints
// that aren't scoped to a single inventory item but still shouldn't be
// exposed to principals with no relevant access anywhere.
func (s *Service) HasAny(
	ctx context.Context,
	principalID uuid.UUID,
	required Mask,
) (bool, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	allowed, err := database.New(s.db).HasAnyInventoryPermission(ctx, database.HasAnyInventoryPermissionParams{
		PrincipalID:  principalID,
		RequiredMask: int64(required),
	})
	if err != nil {
		return false, err
	}

	return allowed, nil
}

// RequireAny enforces HasAny and returns ErrForbidden when the principal
// holds the required mask on no inventory folder.
func (s *Service) RequireAny(
	ctx context.Context,
	principalID uuid.UUID,
	required Mask,
) error {
	allowed, err := s.HasAny(ctx, principalID, required)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrForbidden
	}

	return nil
}

func (s *Service) EffectiveManagementPermissions(
	ctx context.Context,
	principalID uuid.UUID,
) (EffectiveManagementPermissions, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return EffectiveManagementPermissions{}, err
	}
	if isAdmin {
		grants, err := ExpandEffectiveManagementPermissions([]ManagementPermission{
			ManagementPermissionAdministrator,
		})
		if err != nil {
			return EffectiveManagementPermissions{}, err
		}

		return EffectiveManagementPermissions{Grants: grants}, nil
	}

	keys, err := database.New(s.db).ListEffectiveManagementPermissionKeys(ctx, principalID)
	if err != nil {
		return EffectiveManagementPermissions{}, err
	}

	permissions := make([]ManagementPermission, 0, len(keys))
	for _, key := range keys {
		permissions = append(permissions, ManagementPermission(key))
	}

	effective, err := ExpandEffectiveManagementPermissions(permissions)
	if err != nil {
		return EffectiveManagementPermissions{}, err
	}

	return EffectiveManagementPermissions{
		Grants: effective,
	}, nil
}

func (s *Service) HasManagement(
	ctx context.Context,
	principalID uuid.UUID,
	required ManagementPermission,
) (bool, error) {
	effective, err := s.EffectiveManagementPermissions(ctx, principalID)
	if err != nil {
		return false, err
	}

	return effective.Has(required), nil
}

func (s *Service) IsManager(ctx context.Context, principalID uuid.UUID) (bool, error) {
	return s.HasManagement(ctx, principalID, ManagementPermissionManager)
}

func (s *Service) RequireManagement(
	ctx context.Context,
	principalID uuid.UUID,
	required ManagementPermission,
) error {
	allowed, err := s.HasManagement(ctx, principalID, required)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrForbidden
	}

	return nil
}
