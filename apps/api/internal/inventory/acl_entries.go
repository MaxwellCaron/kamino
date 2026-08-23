package inventory

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Service) ListInventoryACLEntries(
	ctx context.Context,
	itemID uuid.UUID,
) ([]database.ListInventoryACLEntriesForItemRow, error) {
	return database.New(s.db).ListInventoryACLEntriesForItem(ctx, itemID)
}

func (s *Service) ListInheritedInventoryACLEntries(
	ctx context.Context,
	itemID uuid.UUID,
) ([]database.ListInheritedInventoryACLEntriesForItemRow, error) {
	return database.New(s.db).ListInheritedInventoryACLEntriesForItem(ctx, itemID)
}

func (s *Service) NormalizeInheritance(ctx context.Context) error {
	_, err := database.New(s.db).NormalizeInventoryItemInheritance(ctx)
	return err
}

func (s *Service) ReplaceInventoryACL(
	ctx context.Context,
	itemID uuid.UUID,
	entries []ACLEntryInput,
) error {
	for _, entry := range entries {
		if err := validateACLEntryInput(entry); err != nil {
			return err
		}
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInventoryItemNotFound
		}
		return err
	}

	if err := q.UpdateInventoryItemInheritance(ctx, database.UpdateInventoryItemInheritanceParams{
		InheritPermissions: true,
		ID:                 itemID,
	}); err != nil {
		return err
	}

	entries = normalizeACLEntries(entries)
	appliesToSelf, appliesToChildren := inventoryACLEntryScope(item.Kind)

	existingEntries, err := q.ListInventoryACLEntriesForItem(ctx, itemID)
	if err != nil {
		return err
	}
	protectedEntries := make([]database.CreateInventoryACLEntryParams, 0, len(existingEntries))
	for _, entry := range existingEntries {
		if !s.IsProtectedACLPrincipal(entry.PrincipalID) {
			continue
		}

		protectedEntries = append(protectedEntries, database.CreateInventoryACLEntryParams{
			InventoryItemID:   itemID,
			PrincipalID:       entry.PrincipalID,
			Effect:            entry.Effect,
			Permissions:       entry.Permissions,
			AppliesToSelf:     entry.AppliesToSelf,
			AppliesToChildren: entry.AppliesToChildren,
			InheritedOnly:     entry.InheritedOnly,
		})
	}

	if err := q.DeleteInventoryACLEntriesForItem(ctx, itemID); err != nil {
		return err
	}

	for _, entry := range protectedEntries {
		if err := q.CreateInventoryACLEntry(ctx, entry); err != nil {
			if isForeignKeyViolation(err) {
				return ErrInventoryPrincipalNotFound
			}
			return err
		}
	}

	for _, entry := range entries {
		if s.IsProtectedACLPrincipal(entry.PrincipalID) {
			continue
		}

		if err := q.CreateInventoryACLEntry(ctx, database.CreateInventoryACLEntryParams{
			InventoryItemID:   itemID,
			PrincipalID:       entry.PrincipalID,
			Effect:            entry.Effect,
			Permissions:       entry.Permissions,
			AppliesToSelf:     appliesToSelf,
			AppliesToChildren: appliesToChildren,
			InheritedOnly:     false,
		}); err != nil {
			if isForeignKeyViolation(err) {
				return ErrInventoryPrincipalNotFound
			}
			return err
		}
	}

	s.notifyTx(ctx, tx, itemID)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}

func inventoryACLEntryScope(kind database.InventoryItemKind) (bool, bool) {
	if kind == database.InventoryItemKindFolder {
		return true, true
	}

	return true, false
}

func normalizeACLEntries(entries []ACLEntryInput) []ACLEntryInput {
	type principalMasks struct {
		allowMask int64
		denyMask  int64
	}

	principalMasksByID := make(map[uuid.UUID]principalMasks, len(entries))
	principalOrder := make([]uuid.UUID, 0, len(entries))

	for _, entry := range entries {
		masks, ok := principalMasksByID[entry.PrincipalID]
		if !ok {
			principalOrder = append(principalOrder, entry.PrincipalID)
		}

		if entry.Effect == database.InventoryAceEffectDeny {
			masks.denyMask |= entry.Permissions
		} else {
			masks.allowMask |= entry.Permissions
		}

		principalMasksByID[entry.PrincipalID] = masks
	}

	normalized := make([]ACLEntryInput, 0, len(principalMasksByID)*2)
	for _, principalID := range principalOrder {
		masks := principalMasksByID[principalID]
		masks.allowMask &= ^masks.denyMask

		if masks.allowMask > 0 {
			normalized = append(normalized, ACLEntryInput{
				PrincipalID: principalID,
				Effect:      database.InventoryAceEffectAllow,
				Permissions: masks.allowMask,
			})
		}
		if masks.denyMask > 0 {
			normalized = append(normalized, ACLEntryInput{
				PrincipalID: principalID,
				Effect:      database.InventoryAceEffectDeny,
				Permissions: masks.denyMask,
			})
		}
	}

	return normalized
}

func validateACLEntryInput(entry ACLEntryInput) error {
	if entry.PrincipalID == uuid.Nil {
		return fmt.Errorf("%w: principal_id is required", ErrInventoryInvalidACL)
	}

	if entry.Effect != database.InventoryAceEffectAllow &&
		entry.Effect != database.InventoryAceEffectDeny {
		return fmt.Errorf("%w: effect must be allow or deny", ErrInventoryInvalidACL)
	}

	if entry.Permissions <= 0 {
		return fmt.Errorf("%w: permissions must be greater than zero", ErrInventoryInvalidACL)
	}

	if authorization.Mask(entry.Permissions)&^authorization.FullAccessMask != 0 {
		return fmt.Errorf("%w: permissions include unknown bits", ErrInventoryInvalidACL)
	}

	return nil
}

func (s *Service) hasProtectedAccess(
	ctx context.Context,
	principalID uuid.UUID,
) (bool, error) {
	return authorization.HasProtectedPrincipalAccess(
		ctx,
		s.db,
		principalID,
		s.protectedACLPrincipalIDs,
	)
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
