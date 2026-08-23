package authorization

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
)

func (s *Service) BootstrapRootAccess(
	ctx context.Context,
	groupNames []string,
) error {
	q := database.New(s.db)

	if len(groupNames) == 0 {
		log.Printf("inventory ACL bootstrap skipped: PRINCIPAL_BOOTSTRAP_ADMIN_GROUP is not configured or could not be resolved")
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
