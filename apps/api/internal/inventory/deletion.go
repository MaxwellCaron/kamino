package inventory

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type FolderDeletionVM struct {
	InventoryItemID uuid.UUID
	Node            string
	VMID            int32
	Name            string
	IsTemplate      bool
}

type FolderDeletionPlan struct {
	ProxmoxVMs []FolderDeletionVM
}

func (s *Service) BuildFolderDeletionPlan(ctx context.Context, id uuid.UUID) (FolderDeletionPlan, error) {
	rows, err := database.New(s.db).GetAllInventoryItems(ctx)
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))

	for _, row := range rows {
		itemsByID[row.ID] = row
		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}

	item, ok := itemsByID[id]
	if !ok {
		return FolderDeletionPlan{}, ErrInventoryFolderNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return FolderDeletionPlan{}, ErrInventoryItemNotFolder
	}
	if isManagedRootFolder(item.ParentID) {
		return FolderDeletionPlan{}, ErrInventoryReservedFolder
	}

	if err := s.EnsureInventorySubtreeDeletable(ctx, id); err != nil {
		return FolderDeletionPlan{}, err
	}

	plan := FolderDeletionPlan{}

	var walk func(uuid.UUID)
	walk = func(itemID uuid.UUID) {
		current := itemsByID[itemID]

		if current.Kind == database.InventoryItemKindFolder {
			for _, childID := range childrenByParent[itemID] {
				walk(childID)
			}
			return
		}

		isTemplate := current.IsTemplate != nil && *current.IsTemplate
		if current.Node != nil && current.Vmid != nil {
			plan.ProxmoxVMs = append(plan.ProxmoxVMs, FolderDeletionVM{
				InventoryItemID: current.ID,
				Node:            *current.Node,
				VMID:            *current.Vmid,
				Name:            current.Name,
				IsTemplate:      isTemplate,
			})
		}
	}

	walk(id)
	return plan, nil
}

func (s *Service) EnsureInventorySubtreeDeletable(ctx context.Context, id uuid.UUID) error {
	blockers, err := database.New(s.db).ListInventoryDeletionBlockersInSubtree(ctx, id)
	if err != nil {
		return err
	}
	if len(blockers) == 0 {
		return nil
	}

	blocker := blockers[0]
	return fmt.Errorf(
		"%w: %s %q references this inventory subtree",
		ErrInventoryItemInUse,
		blocker.BlockerType,
		blocker.BlockerName,
	)
}

func (s *Service) DeleteFolder(ctx context.Context, id uuid.UUID) error {
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
	if isManagedRootFolder(item.ParentID) {
		return ErrInventoryReservedFolder
	}

	if err := q.DeleteInventoryItem(ctx, id); err != nil {
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.scheduleMirror()
	return nil
}

func (s *Service) DeleteInventoryVM(ctx context.Context, itemID uuid.UUID) error {
	if err := s.EnsureInventorySubtreeDeletable(ctx, itemID); err != nil {
		return err
	}
	if err := database.New(s.db).DeleteInventoryItem(ctx, itemID); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}
