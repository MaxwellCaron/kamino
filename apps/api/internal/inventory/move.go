package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) MoveInventoryItem(ctx context.Context, itemID, parentID uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	moved, err := moveInventoryItemTx(ctx, q, itemID, parentID)
	if err != nil {
		return err
	}
	if moved {
		s.notifyTx(ctx, tx, itemID)
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if moved {
		s.scheduleMirror()
	}
	return nil
}

func (s *Service) MoveInventoryItems(ctx context.Context, itemIDs []uuid.UUID, parentID uuid.UUID) error {
	if len(itemIDs) == 0 {
		return nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	moved := false

	for _, itemID := range itemIDs {
		itemMoved, err := moveInventoryItemTx(ctx, q, itemID, parentID)
		if err != nil {
			return err
		}
		moved = moved || itemMoved
	}

	if moved {
		s.notify(ctx, tx)
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if moved {
		s.scheduleMirror()
	}
	return nil
}

func moveInventoryItemTx(
	ctx context.Context,
	q *database.Queries,
	itemID uuid.UUID,
	parentID uuid.UUID,
) (bool, error) {
	item, err := q.GetInventoryItemForUpdate(ctx, itemID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrInventoryItemNotFound
	}
	if err != nil {
		return false, err
	}

	parent, err := q.GetInventoryItemForUpdate(ctx, parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrInventoryParentNotFound
	}
	if err != nil {
		return false, err
	}
	if parent.Kind != database.InventoryItemKindFolder {
		return false, ErrInventoryTargetNotFolder
	}
	if item.ID == parent.ID {
		return false, ErrInventoryInvalidMove
	}
	if item.ParentID != nil && *item.ParentID == parentID {
		return false, nil
	}
	if isManagedRootFolder(item.ParentID) {
		return false, ErrInventoryReservedFolder
	}
	if err := ensureFolderDepthForMove(ctx, q, itemID, parentID); err != nil {
		return false, err
	}

	err = q.UpdateInventoryItemParent(ctx, database.UpdateInventoryItemParentParams{
		ParentID: &parentID,
		ID:       itemID,
	})
	if err != nil {
		return false, normalizeMutationError(err)
	}

	return true, nil
}
