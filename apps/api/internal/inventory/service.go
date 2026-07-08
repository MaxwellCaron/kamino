package inventory

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInventoryItemNotFound        = errors.New("inventory item not found")
	ErrInventoryParentNotFound      = errors.New("inventory parent not found")
	ErrInventoryFolderNotFound      = errors.New("inventory folder not found")
	ErrInventoryTargetNotFolder     = errors.New("inventory target must be a folder")
	ErrInventoryItemNotFolder       = errors.New("inventory item is not a folder")
	ErrInventoryInvalidMove         = errors.New("invalid inventory move")
	ErrInventoryReservedFolder      = errors.New("reserved inventory folder cannot be changed")
	ErrInventoryFolderConflict      = errors.New("inventory folder with that name already exists")
	ErrInventoryFolderDepthExceeded = errors.New("folder depth cannot exceed 3 levels below root")
	ErrInventoryInvalidFolderLimit  = errors.New("folder limit must be greater than zero")
	ErrInventoryFolderLimitExceeded = errors.New("folder limit exceeded")
	ErrInventoryItemInUse           = errors.New("inventory item is in use")
	ErrInventoryInvalidACL          = errors.New("invalid inventory ACL entry")
	ErrInventoryPrincipalNotFound   = errors.New("principal not found")
	ErrInventoryDescriptionTooLong  = errors.New("folder description must be 256 characters or less")
)

const MaxFolderDescriptionLength = 256

const maxProxmoxPoolDepth = 3

type Service struct {
	db                       *pgxpool.Pool
	notifier                 *Notifier
	mirror                   Mirror
	protectedACLPrincipalIDs map[uuid.UUID]struct{}
}

type Mirror interface {
	ScheduleReconcile()
}

func NewService(
	db *pgxpool.Pool,
	notifier *Notifier,
	mirror Mirror,
	protectedACLPrincipalIDs []uuid.UUID,
) *Service {
	protectedIDs := make(map[uuid.UUID]struct{}, len(protectedACLPrincipalIDs))
	for _, principalID := range protectedACLPrincipalIDs {
		if principalID == uuid.Nil {
			continue
		}
		protectedIDs[principalID] = struct{}{}
	}

	return &Service{
		db:                       db,
		notifier:                 notifier,
		mirror:                   mirror,
		protectedACLPrincipalIDs: protectedIDs,
	}
}

func isManagedRootFolder(parentID *uuid.UUID) bool {
	return parentID == nil
}

func ensureFolderDepthForCreate(ctx context.Context, q *database.Queries, parentID uuid.UUID) error {
	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return err
	}

	itemsByID := inventoryItemsByID(rows)
	parentDepth, err := folderDepthBelowRoot(parentID, itemsByID)
	if err != nil {
		return err
	}
	if parentDepth+1 > maxProxmoxPoolDepth {
		return ErrInventoryFolderDepthExceeded
	}

	return nil
}

func ensureFolderDepthForMove(ctx context.Context, q *database.Queries, itemID, parentID uuid.UUID) error {
	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return err
	}

	itemsByID := inventoryItemsByID(rows)
	targetParentDepth, err := folderDepthBelowRoot(parentID, itemsByID)
	if err != nil {
		return err
	}
	if targetParentDepth > maxProxmoxPoolDepth {
		return ErrInventoryFolderDepthExceeded
	}

	item, ok := itemsByID[itemID]
	if !ok {
		return ErrInventoryItemNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return nil
	}

	childrenByParent := inventoryChildrenByParent(rows)
	deepestMovedFolderDepth := targetParentDepth + 1 + maxChildFolderDepth(itemID, itemsByID, childrenByParent)
	if deepestMovedFolderDepth > maxProxmoxPoolDepth {
		return ErrInventoryFolderDepthExceeded
	}

	return nil
}

func inventoryItemsByID(rows []database.GetAllInventoryItemsRow) map[uuid.UUID]database.GetAllInventoryItemsRow {
	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row
	}
	return itemsByID
}

func inventoryChildrenByParent(rows []database.GetAllInventoryItemsRow) map[uuid.UUID][]uuid.UUID {
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, row := range rows {
		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}
	return childrenByParent
}

func folderDepthBelowRoot(id uuid.UUID, itemsByID map[uuid.UUID]database.GetAllInventoryItemsRow) (int, error) {
	depth := 0
	current, ok := itemsByID[id]
	if !ok {
		return 0, ErrInventoryParentNotFound
	}
	if current.Kind != database.InventoryItemKindFolder {
		return 0, ErrInventoryTargetNotFolder
	}

	for current.ParentID != nil {
		depth++
		parent, ok := itemsByID[*current.ParentID]
		if !ok {
			return 0, ErrInventoryParentNotFound
		}
		current = parent
	}

	return depth, nil
}

func maxChildFolderDepth(id uuid.UUID, itemsByID map[uuid.UUID]database.GetAllInventoryItemsRow, childrenByParent map[uuid.UUID][]uuid.UUID) int {
	maxDepth := 0
	for _, childID := range childrenByParent[id] {
		child := itemsByID[childID]
		if child.Kind != database.InventoryItemKindFolder {
			continue
		}

		childDepth := 1 + maxChildFolderDepth(childID, itemsByID, childrenByParent)
		if childDepth > maxDepth {
			maxDepth = childDepth
		}
	}

	return maxDepth
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

	if strings.Contains(pgErr.Message, "Folder limit exceeded") {
		return ErrInventoryFolderLimitExceeded
	}

	return fmt.Errorf("%w: %s", ErrInventoryInvalidMove, pgErr.Message)
}

func NormalizeFolderDescription(description *string) (*string, error) {
	if description == nil {
		return nil, nil
	}
	value := strings.TrimSpace(*description)
	if value == "" {
		return nil, nil
	}
	if len(value) > MaxFolderDescriptionLength {
		return nil, ErrInventoryDescriptionTooLong
	}
	return &value, nil
}
