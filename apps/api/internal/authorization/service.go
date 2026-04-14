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
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrForbidden = errors.New("forbidden")

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) EffectivePermissions(
	ctx context.Context,
	principalID uuid.UUID,
	itemID uuid.UUID,
) (EffectivePermissions, error) {
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

	count, err := q.CountInventoryACLEntries(ctx)
	if err != nil {
		return fmt.Errorf("count inventory acl entries: %w", err)
	}
	if count > 0 {
		return nil
	}

	if len(groupNames) == 0 {
		log.Printf("inventory ACL bootstrap skipped: LDAP_ADMIN_GROUP_DN is not configured or could not be resolved, and all inventory access will be denied until ACEs are seeded")
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

	log.Printf("seeded inventory ACL root access for %d admin groups", len(rows))
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
