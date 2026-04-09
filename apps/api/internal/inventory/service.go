package inventory

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInventoryItemNotFound    = errors.New("inventory item not found")
	ErrInventoryParentNotFound  = errors.New("inventory parent not found")
	ErrInventoryFolderNotFound  = errors.New("inventory folder not found")
	ErrInventoryTargetNotFolder = errors.New("inventory target must be a folder")
	ErrInventoryItemNotFolder   = errors.New("inventory item is not a folder")
	ErrInventoryInvalidMove     = errors.New("invalid inventory move")
	ErrInventoryReservedFolder  = errors.New("reserved inventory folder cannot be changed")
	ErrInventoryFolderConflict  = errors.New("inventory folder with that name already exists")
)

const proxmoxRootFolderName = "Proxmox"

type Service struct {
	db       *pgxpool.Pool
	notifier *Notifier
	mirror   Mirror
}

type Mirror interface {
	ScheduleReconcile()
}

func NewService(db *pgxpool.Pool, notifier *Notifier, mirror Mirror) *Service {
	return &Service{
		db:       db,
		notifier: notifier,
		mirror:   mirror,
	}
}

func (s *Service) GetAllInventoryItems(ctx context.Context) ([]database.GetAllInventoryItemsRow, error) {
	return database.New(s.db).GetAllInventoryItems(ctx)
}

func (s *Service) GetInventoryItemByID(ctx context.Context, id uuid.UUID) (database.GetInventoryItemByIDRow, error) {
	return database.New(s.db).GetInventoryItemByID(ctx, id)
}

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
	if item.ParentID == nil && item.Name == proxmoxRootFolderName {
		return ErrInventoryReservedFolder
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

func (s *Service) MoveInventoryItem(ctx context.Context, itemID, parentID uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, itemID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryItemNotFound
	}
	if err != nil {
		return err
	}

	parent, err := q.GetInventoryItemForUpdate(ctx, parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryParentNotFound
	}
	if err != nil {
		return err
	}
	if parent.Kind != database.InventoryItemKindFolder {
		return ErrInventoryTargetNotFolder
	}
	if item.ID == parent.ID {
		return ErrInventoryInvalidMove
	}
	if item.ParentID != nil && *item.ParentID == parentID {
		return tx.Commit(ctx)
	}
	if item.ParentID == nil && item.Name == proxmoxRootFolderName {
		return ErrInventoryReservedFolder
	}

	err = q.UpdateInventoryItemParent(ctx, database.UpdateInventoryItemParentParams{
		ParentID: &parentID,
		ID:       itemID,
	})
	if err != nil {
		return normalizeMutationError(err)
	}

	s.notifyTx(ctx, tx, itemID)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.scheduleMirror()
	return nil
}

func (s *Service) DeleteInventoryItemByProxmoxVM(ctx context.Context, node string, vmid int32) error {
	if err := database.New(s.db).DeleteInventoryItemByProxmoxVM(ctx, database.DeleteInventoryItemByProxmoxVMParams{
		Node: node,
		Vmid: vmid,
	}); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) UpdateInventoryItemNameByProxmoxVM(ctx context.Context, node string, vmid int32, name string) error {
	if err := database.New(s.db).UpdateInventoryItemNameByProxmoxVM(ctx, database.UpdateInventoryItemNameByProxmoxVMParams{
		Name: name,
		Node: node,
		Vmid: vmid,
	}); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) UpdateProxmoxVMIsTemplate(ctx context.Context, node string, vmid int32) error {
	if err := database.New(s.db).UpdateProxmoxVMIsTemplate(ctx, database.UpdateProxmoxVMIsTemplateParams{
		Node: node,
		Vmid: vmid,
	}); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}

func (s *Service) notifyTx(ctx context.Context, tx pgx.Tx, itemID uuid.UUID) {
	s.notify(ctx, tx, &itemID)
}

func (s *Service) notify(ctx context.Context, exec database.DBTX, itemID ...*uuid.UUID) {
	if s.notifier == nil {
		return
	}

	target := exec
	if target == nil {
		target = s.db
	}

	event := Event{
		Type:  "inventory.changed",
		Scope: "tree",
	}
	if len(itemID) > 0 {
		event.ItemID = itemID[0]
	}

	if err := s.notifier.Notify(ctx, target, event); err != nil {
		log.Printf("inventory notify failed: %v", err)
	}
}

func (s *Service) scheduleMirror() {
	if s.mirror != nil {
		s.mirror.ScheduleReconcile()
	}
}

func normalizeMutationError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return err
	}

	if strings.Contains(pgErr.Message, "Cannot move a folder into its own subtree") ||
		strings.Contains(pgErr.Message, "Cannot move an item into itself") {
		return ErrInventoryInvalidMove
	}

	if strings.Contains(pgErr.Message, "Parent must be a folder") {
		return ErrInventoryTargetNotFolder
	}

	return fmt.Errorf("%w: %s", ErrInventoryInvalidMove, pgErr.Message)
}
