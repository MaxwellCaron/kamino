package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) UpdateInventoryVMName(ctx context.Context, itemID uuid.UUID, name string) error {
	if err := database.New(s.db).UpdateInventoryItemName(ctx, database.UpdateInventoryItemNameParams{
		Name: name,
		ID:   itemID,
	}); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) UpdateInventoryVMIsTemplate(ctx context.Context, itemID uuid.UUID) error {
	if err := database.New(s.db).UpdateProxmoxVMIsTemplateByItemID(ctx, itemID); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) UpdateInventoryVMNotes(ctx context.Context, itemID uuid.UUID, notes string) error {
	if err := database.New(s.db).UpdateProxmoxVMNotesByItemID(ctx, database.UpdateProxmoxVMNotesByItemIDParams{
		Notes:           &notes,
		InventoryItemID: itemID,
	}); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) UpdateInventoryVMHardwareSummary(
	ctx context.Context,
	itemID uuid.UUID,
	cpuCount int32,
	memoryMB int32,
	diskGB float64,
) error {
	if err := database.New(s.db).UpdateProxmoxVMHardwareSummaryByItemID(
		ctx,
		database.UpdateProxmoxVMHardwareSummaryByItemIDParams{
			CpuCount:        &cpuCount,
			MemoryMb:        &memoryMB,
			DiskGb:          &diskGB,
			InventoryItemID: itemID,
		},
	); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) RegisterProxmoxVM(
	ctx context.Context,
	parentID uuid.UUID,
	node string,
	vmid int32,
	upstreamUUID uuid.UUID,
	name string,
	isTemplate bool,
) (uuid.UUID, error) {
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

	itemID, err := q.CreateVMItem(ctx, database.CreateVMItemParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err != nil {
		return uuid.Nil, normalizeMutationError(err)
	}

	if err := q.InsertProxmoxVM(ctx, database.InsertProxmoxVMParams{
		InventoryItemID: itemID,
		Node:            node,
		Vmid:            vmid,
		GuestType:       "qemu",
		UpstreamUuid:    upstreamUUID,
		IsTemplate:      isTemplate,
	}); err != nil {
		return uuid.Nil, err
	}

	s.notifyTx(ctx, tx, itemID)

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return itemID, nil
}

func (s *Service) NotifyInventoryChanged(ctx context.Context, itemID uuid.UUID) {
	s.notify(ctx, nil, &itemID)
}

// NotifyInventoryTreeChanged broadcasts a tree-level inventory change without
// targeting a specific item.
func (s *Service) NotifyInventoryTreeChanged(ctx context.Context) {
	s.notify(ctx, nil)
}
