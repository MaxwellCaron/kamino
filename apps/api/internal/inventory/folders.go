package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) CreateFolder(ctx context.Context, parentID uuid.UUID, name string) (uuid.UUID, error) {
	name = names.Normalize(name)
	if err := names.ValidateFolder(name); err != nil {
		return uuid.Nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	parent, err := q.GetInventoryItemForUpdate(ctx, parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrInventoryParentNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if parent.Kind != database.InventoryItemKindFolder {
		return uuid.Nil, ErrInventoryTargetNotFolder
	}
	if err := ensureFolderDepthForCreate(ctx, q, parentID); err != nil {
		return uuid.Nil, err
	}

	existingID, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: &parentID,
		Name:     name,
	})
	switch {
	case err == nil && existingID != uuid.Nil:
		return uuid.Nil, ErrInventoryFolderConflict
	case err != nil && !errors.Is(err, pgx.ErrNoRows):
		return uuid.Nil, err
	}

	folderID, err := q.CreateChildFolder(ctx, database.CreateChildFolderParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return uuid.Nil, ErrInventoryFolderConflict
		}
		return uuid.Nil, err
	}

	s.notifyTx(ctx, tx, folderID)

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	s.scheduleMirror()
	return folderID, nil
}

func (s *Service) RenameFolder(ctx context.Context, id uuid.UUID, name string) error {
	name = names.Normalize(name)
	if err := names.ValidateFolder(name); err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryFolderNotFound
	}
	if err != nil {
		return err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}

	if item.ParentID != nil {
		existingID, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
			ParentID: item.ParentID,
			Name:     name,
		})
		switch {
		case err == nil && existingID != id:
			return ErrInventoryFolderConflict
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			return err
		}
	}

	if err := q.UpdateInventoryItemName(ctx, database.UpdateInventoryItemNameParams{
		Name: name,
		ID:   id,
	}); err != nil {
		if isUniqueViolation(err) {
			return ErrInventoryFolderConflict
		}
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.scheduleMirror()
	return nil
}
