package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) UpdateFolderVMLimit(ctx context.Context, id uuid.UUID, limit *int32) error {
	if limit != nil && *limit <= 0 {
		return ErrInventoryInvalidFolderLimit
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

	if err := q.UpdateInventoryFolderVMLimit(ctx, database.UpdateInventoryFolderVMLimitParams{
		VmLimit: limit,
		ID:      id,
	}); err != nil {
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}

func (s *Service) EnsureFolderHasVMCapacity(ctx context.Context, folderID uuid.UUID, addedVMCount int32) error {
	if addedVMCount <= 0 {
		return nil
	}

	rows, err := database.New(s.db).GetAllInventoryItems(ctx)
	if err != nil {
		return err
	}

	var item database.GetAllInventoryItemsRow
	found := false
	for _, row := range rows {
		if row.ID == folderID {
			item = row
			found = true
			break
		}
	}

	if !found {
		return ErrInventoryFolderNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}

	if item.EffectiveVmLimit > 0 && item.VmCount+addedVMCount > item.EffectiveVmLimit {
		return ErrInventoryFolderLimitExceeded
	}

	return nil
}

type ReservationResult struct {
	ReservationID uuid.UUID
	Release       func(ctx context.Context) error
}

func (s *Service) ReserveFolderVMCapacity(ctx context.Context, folderID uuid.UUID, addedVMCount int32, operation string) (*ReservationResult, error) {
	if addedVMCount <= 0 {
		return nil, nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, folderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInventoryFolderNotFound
		}
		return nil, err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return nil, ErrInventoryItemNotFolder
	}

	var effectiveLimit int32
	err = tx.QueryRow(ctx, `SELECT COALESCE(inventory_folder_effective_vm_limit($1), 0)::INTEGER`, folderID).Scan(&effectiveLimit)
	if err != nil {
		return nil, err
	}

	var currentCount int32
	err = tx.QueryRow(ctx, `SELECT inventory_folder_vm_count($1, NULL)::INTEGER`, folderID).Scan(&currentCount)
	if err != nil {
		return nil, err
	}

	reserved, err := q.SumActiveFolderVMCapacityReservations(ctx, folderID)
	if err != nil {
		return nil, err
	}

	if effectiveLimit > 0 && currentCount+reserved+addedVMCount > effectiveLimit {
		return nil, ErrInventoryFolderLimitExceeded
	}

	res, err := q.CreateFolderVMCapacityReservation(ctx, database.CreateFolderVMCapacityReservationParams{
		FolderID:  folderID,
		VmCount:   addedVMCount,
		Operation: operation,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	resID := res.ID
	release := func(ctx context.Context) error {
		return database.New(s.db).ReleaseFolderVMCapacityReservation(context.WithoutCancel(ctx), resID)
	}

	return &ReservationResult{
		ReservationID: resID,
		Release:       release,
	}, nil
}

// SweepExpiredFolderVMCapacityReservations deletes reservations past their TTL
func (s *Service) SweepExpiredFolderVMCapacityReservations(ctx context.Context) (int64, error) {
	return database.New(s.db).DeleteExpiredFolderVMCapacityReservations(ctx)
}
