package authorization

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrForbidden                  = errors.New("forbidden")
	ErrManagementACLRequiresGroup = errors.New("management ACL requires a group principal")
)

type Service struct {
	db                          *pgxpool.Pool
	protectedManagementGroupIDs map[uuid.UUID]struct{}
}

func NewService(db *pgxpool.Pool, protectedManagementGroupIDs []uuid.UUID) *Service {
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
		return EffectivePermissions{
			AllowedMask: FullAccessMask,
			DeniedMask:  0,
		}, nil
	}

	row, err := database.New(s.db).GetEffectiveInventoryPermissions(ctx, database.GetEffectiveInventoryPermissionsParams{
		PrincipalID:     principalID,
		InventoryItemID: itemID,
	})
	if err != nil {
		return EffectivePermissions{}, err
	}

	return EffectivePermissions{
		AllowedMask: Mask(row.AllowedMask),
		DeniedMask:  Mask(row.DeniedMask),
	}, nil
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

func (s *Service) EffectiveManagementPermissions(
	ctx context.Context,
	principalID uuid.UUID,
) (EffectiveManagementPermissions, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return EffectiveManagementPermissions{}, err
	}
	if isAdmin {
		return EffectiveManagementPermissions{
			AllowedMask: FullManagementAccessMask,
			DeniedMask:  0,
		}, nil
	}

	row, err := database.New(s.db).GetEffectiveManagementPermissions(ctx, principalID)
	if err != nil {
		return EffectiveManagementPermissions{}, err
	}

	return EffectiveManagementPermissions{
		AllowedMask: ManagementMask(row.AllowedMask),
		DeniedMask:  ManagementMask(row.DeniedMask),
	}, nil
}

func (s *Service) HasManagement(
	ctx context.Context,
	principalID uuid.UUID,
	required ManagementMask,
) (bool, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	allowed, err := database.New(s.db).HasManagementPermission(ctx, database.HasManagementPermissionParams{
		PrincipalID:  principalID,
		RequiredMask: int64(required),
	})
	if err != nil {
		return false, err
	}

	return allowed, nil
}

func (s *Service) RequireManagement(
	ctx context.Context,
	principalID uuid.UUID,
	required ManagementMask,
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

func (s *Service) ResolveVMItemID(
	ctx context.Context,
	node string,
	vmid int32,
) (uuid.UUID, error) {
	return database.New(s.db).GetInventoryItemIDByProxmoxVM(ctx, database.GetInventoryItemIDByProxmoxVMParams{
		Node: node,
		Vmid: vmid,
	})
}

func (s *Service) FilterVisibleStatuses(
	ctx context.Context,
	principalID uuid.UUID,
	statuses map[int]string,
) (map[int]string, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		filtered := make(map[int]string, len(statuses))
		for vmid, status := range statuses {
			filtered[vmid] = status
		}
		return filtered, nil
	}

	visibleVMIDs, err := database.New(s.db).ListVisibleVMIDsForPrincipal(ctx, principalID)
	if err != nil {
		return nil, err
	}

	filtered := make(map[int]string, len(visibleVMIDs))
	for _, vmid := range visibleVMIDs {
		status, ok := statuses[int(vmid)]
		if ok {
			filtered[int(vmid)] = status
		}
	}

	return filtered, nil
}

func (s *Service) BootstrapRootAccess(
	ctx context.Context,
	groupNames []string,
) error {
	q := database.New(s.db)

	if len(groupNames) == 0 {
		log.Printf("inventory ACL bootstrap skipped: LDAP_ADMIN_GROUP_DN is not configured or could not be resolved")
		return nil
	}

	rootIDs, err := q.ListRootInventoryFolderIDs(ctx)
	if err != nil {
		return fmt.Errorf("list root inventory folders: %w", err)
	}
	if len(rootIDs) == 0 {
		return nil
	}

	rows, err := q.GetPrincipalGroupsByName(ctx, normalizeGroupNames(groupNames))
	if err != nil {
		return fmt.Errorf("resolve bootstrap admin groups: %w", err)
	}
	if len(rows) == 0 {
		log.Printf("inventory ACL bootstrap skipped: none of the configured admin groups were found: %s", strings.Join(groupNames, ", "))
		return nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin bootstrap inventory acl tx: %w", err)
	}
	defer tx.Rollback(ctx)

	txq := database.New(tx)
	for _, rootID := range rootIDs {
		for _, group := range rows {
			if err := txq.CreateInventoryACLEntry(ctx, database.CreateInventoryACLEntryParams{
				InventoryItemID:   rootID,
				PrincipalID:       group.ID,
				Effect:            database.InventoryAceEffectAllow,
				Permissions:       int64(FullAccessMask),
				AppliesToSelf:     true,
				AppliesToChildren: true,
				InheritedOnly:     false,
			}); err != nil {
				return fmt.Errorf("grant bootstrap inventory acl to %s: %w", deref(group.Name), err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit bootstrap inventory acl tx: %w", err)
	}

	log.Printf("ensured inventory ACL root entries for %d admin groups", len(rows))
	return nil
}

func (s *Service) GetManagementPermissionsForGroup(
	ctx context.Context,
	groupID uuid.UUID,
) (ManagementMask, bool, error) {
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return 0, false, err
	}

	if s.IsProtectedManagementGroup(groupID) {
		return FullManagementAccessMask, true, nil
	}

	permissions, err := database.New(s.db).GetManagementACLEntryForGroup(ctx, groupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}

	return ManagementMask(permissions), false, nil
}

func (s *Service) SetManagementPermissionsForGroup(
	ctx context.Context,
	groupID uuid.UUID,
	permissions ManagementMask,
) error {
	if err := validateManagementMask(permissions); err != nil {
		return err
	}
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return err
	}
	if s.IsProtectedManagementGroup(groupID) {
		return ErrForbidden
	}

	q := database.New(s.db)
	if permissions == 0 {
		return q.DeleteManagementACLEntryForGroup(ctx, groupID)
	}

	return q.UpsertManagementACLEntry(ctx, database.UpsertManagementACLEntryParams{
		GroupPrincipalID: groupID,
		Permissions:      int64(permissions),
	})
}

func (s *Service) HasProtectedAccess(
	ctx context.Context,
	principalID uuid.UUID,
) (bool, error) {
	return HasProtectedPrincipalAccess(ctx, s.db, principalID, s.protectedManagementGroupIDs)
}

func (s *Service) IsProtectedManagementGroup(principalID uuid.UUID) bool {
	_, ok := s.protectedManagementGroupIDs[principalID]
	return ok
}

func (s *Service) requireGroupPrincipal(ctx context.Context, principalID uuid.UUID) error {
	principal, err := database.New(s.db).GetPrincipalByID(ctx, principalID)
	if err != nil {
		return err
	}
	if principal.PrincipalType != database.PrincipalTypeGroup {
		return ErrManagementACLRequiresGroup
	}

	return nil
}

func normalizeGroupNames(values []string) []string {
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func validateManagementMask(mask ManagementMask) error {
	if mask < 0 {
		return fmt.Errorf("invalid management ACL: permissions must be zero or greater")
	}
	if mask&^FullManagementAccessMask != 0 {
		return fmt.Errorf("invalid management ACL: permissions include unknown bits")
	}

	return nil
}

func IsForbidden(err error) bool {
	return errors.Is(err, ErrForbidden)
}

func IsMissingVM(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func IsManagementACLRequiresGroup(err error) bool {
	return errors.Is(err, ErrManagementACLRequiresGroup)
}

func HasProtectedPrincipalAccess(
	ctx context.Context,
	db *pgxpool.Pool,
	principalID uuid.UUID,
	protectedPrincipalIDs map[uuid.UUID]struct{},
) (bool, error) {
	if len(protectedPrincipalIDs) == 0 {
		return false, nil
	}

	effectivePrincipalIDs, err := database.New(db).ListEffectivePrincipalIDs(ctx, principalID)
	if err != nil {
		return false, err
	}

	for _, effectivePrincipalID := range effectivePrincipalIDs {
		if _, ok := protectedPrincipalIDs[effectivePrincipalID]; ok {
			return true, nil
		}
	}

	return false, nil
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
