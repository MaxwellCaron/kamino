package authorization

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

func (s *Service) GetVMRecord(ctx context.Context, itemID uuid.UUID) (VMRecord, error) {
	row, err := database.New(s.db).GetProxmoxVMByInventoryItemID(ctx, itemID)
	if err != nil {
		return VMRecord{}, err
	}

	return VMRecord{
		InventoryItemID: row.InventoryItemID,
		Node:            row.Node,
		Vmid:            row.Vmid,
		UpstreamUUID:    row.UpstreamUuid,
	}, nil
}

// GetVMRecordForUpdate uses SELECT ... FOR UPDATE for mutation paths. The row
// lock only persists for the lifetime of the surrounding transaction.
func (s *Service) GetVMRecordForUpdate(ctx context.Context, itemID uuid.UUID) (VMRecord, error) {
	row, err := database.New(s.db).GetProxmoxVMByInventoryItemIDForUpdate(ctx, itemID)
	if err != nil {
		return VMRecord{}, err
	}

	return VMRecord{
		InventoryItemID: row.InventoryItemID,
		Node:            row.Node,
		Vmid:            row.Vmid,
		UpstreamUUID:    row.UpstreamUuid,
	}, nil
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

type GroupManagementPermissions struct {
	CanEditBootstrapOnly bool
	EffectiveGrants      []ManagementPermission
	Grants               []ManagementPermission
	Immutable            bool
}

func (s *Service) GetManagementPermissionsForGroup(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	groupID uuid.UUID,
) (GroupManagementPermissions, error) {
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return GroupManagementPermissions{}, err
	}

	actorHasProtectedAccess, err := s.HasProtectedAccess(ctx, actorPrincipalID)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	if s.IsProtectedManagementGroup(groupID) {
		directGrants := []ManagementPermission{ManagementPermissionAdministrator}
		effectiveGrants, err := ExpandEffectiveManagementPermissions(directGrants)
		if err != nil {
			return GroupManagementPermissions{}, err
		}

		return GroupManagementPermissions{
			CanEditBootstrapOnly: actorHasProtectedAccess,
			EffectiveGrants:      effectiveGrants,
			Grants:               directGrants,
			Immutable:            true,
		}, nil
	}

	keys, err := database.New(s.db).ListManagementPermissionGrantsForGroup(ctx, groupID)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	grants := make([]ManagementPermission, 0, len(keys))
	for _, key := range keys {
		grants = append(grants, ManagementPermission(key))
	}

	directGrants, err := NormalizeDirectManagementPermissions(grants)
	if err != nil {
		return GroupManagementPermissions{}, err
	}
	effectiveGrants, err := ExpandEffectiveManagementPermissions(directGrants)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	return GroupManagementPermissions{
		CanEditBootstrapOnly: actorHasProtectedAccess,
		EffectiveGrants:      effectiveGrants,
		Grants:               directGrants,
		Immutable:            false,
	}, nil
}

func (s *Service) SetManagementPermissionsForGroup(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	groupID uuid.UUID,
	permissions []ManagementPermission,
) error {
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return err
	}
	if s.IsProtectedManagementGroup(groupID) {
		return ErrForbidden
	}

	directGrants, err := NormalizeDirectManagementPermissions(permissions)
	if err != nil {
		return err
	}

	actorHasProtectedAccess, err := s.HasProtectedAccess(ctx, actorPrincipalID)
	if err != nil {
		return err
	}
	if !actorHasProtectedAccess {
		return ErrForbidden
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	txq := database.New(tx)
	if err := txq.DeleteManagementPermissionGrantsForGroup(ctx, groupID); err != nil {
		return err
	}

	for _, permission := range directGrants {
		if err := txq.CreateManagementPermissionGrant(ctx, database.CreateManagementPermissionGrantParams{
			GroupPrincipalID: groupID,
			PermissionKey:    string(permission),
		}); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
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

func IsForbidden(err error) bool {
	return errors.Is(err, ErrForbidden)
}

func IsMissingVM(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func IsManagementACLRequiresGroup(err error) bool {
	return errors.Is(err, ErrManagementACLRequiresGroup)
}

type principalCacheKey struct{}

// principalCache memoizes ListEffectivePrincipalIDs results
type principalCache struct {
	mu   sync.Mutex
	data map[uuid.UUID][]uuid.UUID
}

// WithPrincipalCache returns a context carrying a per-request cache
func WithPrincipalCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, principalCacheKey{}, &principalCache{
		data: make(map[uuid.UUID][]uuid.UUID),
	})
}

func loadEffectivePrincipalIDs(
	ctx context.Context,
	db dbtx,
	principalID uuid.UUID,
) ([]uuid.UUID, error) {
	cache, _ := ctx.Value(principalCacheKey{}).(*principalCache)
	if cache != nil {
		cache.mu.Lock()
		ids, ok := cache.data[principalID]
		cache.mu.Unlock()
		if ok {
			return ids, nil
		}
	}

	ids, err := database.New(db).ListEffectivePrincipalIDs(ctx, principalID)
	if err != nil {
		return nil, err
	}

	if cache != nil {
		cache.mu.Lock()
		cache.data[principalID] = ids
		cache.mu.Unlock()
	}

	return ids, nil
}

func HasProtectedPrincipalAccess(
	ctx context.Context,
	db dbtx,
	principalID uuid.UUID,
	protectedPrincipalIDs map[uuid.UUID]struct{},
) (bool, error) {
	if len(protectedPrincipalIDs) == 0 {
		return false, nil
	}

	effectivePrincipalIDs, err := loadEffectivePrincipalIDs(ctx, db, principalID)
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

func managementPermissionSliceHas(
	permissions []ManagementPermission,
	required ManagementPermission,
) bool {
	for _, permission := range permissions {
		if permission == required {
			return true
		}
	}

	return false
}

func targetKindForInventoryItemKind(kind database.InventoryItemKind) InventoryPermissionTargetKind {
	if kind == database.InventoryItemKindFolder {
		return InventoryPermissionTargetKindFolder
	}

	return InventoryPermissionTargetKindVM
}
