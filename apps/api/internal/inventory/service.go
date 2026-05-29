package inventory

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
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
	ErrInventoryInvalidACL          = errors.New("invalid inventory ACL entry")
	ErrInventoryPrincipalNotFound   = errors.New("principal not found")
)

const maxProxmoxPoolDepth = 3

type Service struct {
	db                       *pgxpool.Pool
	notifier                 *Notifier
	mirror                   Mirror
	protectedACLPrincipalIDs map[uuid.UUID]struct{}
}

type FolderDeletionVM struct {
	Node       string
	VMID       int32
	Name       string
	IsTemplate bool
}

type FolderDeletionPlan struct {
	ProxmoxVMs []FolderDeletionVM
}

type FolderPlacement struct {
	FolderID uuid.UUID
	Path     []string
	PoolID   string
}

type ACLEntryInput struct {
	PrincipalID uuid.UUID
	Effect      database.InventoryAceEffect
	Permissions int64
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

func (s *Service) IsProtectedACLPrincipal(principalID uuid.UUID) bool {
	_, ok := s.protectedACLPrincipalIDs[principalID]
	return ok
}

func (s *Service) GetAllInventoryItems(ctx context.Context) ([]database.GetAllInventoryItemsRow, error) {
	return database.New(s.db).GetAllInventoryItems(ctx)
}

func (s *Service) GetVisibleInventoryItems(
	ctx context.Context,
	principalID uuid.UUID,
) ([]database.GetVisibleInventoryItemsForPrincipalRow, error) {
	q := database.New(s.db)

	isProtected, err := s.hasProtectedAccess(ctx, principalID)
	if err != nil {
		return nil, err
	}
	if isProtected {
		allRows, err := q.GetAllInventoryItems(ctx)
		if err != nil {
			return nil, err
		}
		return toFullAccessInventoryRows(allRows), nil
	}

	visibleRows, err := q.GetVisibleInventoryItemsForPrincipal(ctx, principalID)
	if err != nil {
		return nil, err
	}
	if len(visibleRows) == 0 {
		return visibleRows, nil
	}

	allRows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return nil, err
	}

	return expandVisibleInventoryRows(visibleRows, allRows), nil
}

func expandVisibleInventoryRows(
	visibleRows []database.GetVisibleInventoryItemsForPrincipalRow,
	allRows []database.GetAllInventoryItemsRow,
) []database.GetVisibleInventoryItemsForPrincipalRow {
	rowsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(allRows))
	for _, row := range allRows {
		rowsByID[row.ID] = row
	}

	expandedRows := make([]database.GetVisibleInventoryItemsForPrincipalRow, 0, len(visibleRows))
	includedIDs := make(map[uuid.UUID]struct{}, len(visibleRows))

	for _, row := range visibleRows {
		expandedRows = append(expandedRows, row)
		includedIDs[row.ID] = struct{}{}
	}

	for _, row := range visibleRows {
		for parentID := row.ParentID; parentID != nil; {
			parentRow, ok := rowsByID[*parentID]
			if !ok {
				break
			}

			if _, exists := includedIDs[parentRow.ID]; !exists {
				expandedRows = append(expandedRows, database.GetVisibleInventoryItemsForPrincipalRow{
					ID:                 parentRow.ID,
					ParentID:           parentRow.ParentID,
					Kind:               parentRow.Kind,
					Name:               parentRow.Name,
					InheritPermissions: true,
					DirectVmLimit:      parentRow.DirectVmLimit,
					EffectiveVmLimit:   parentRow.EffectiveVmLimit,
					VmCount:            parentRow.VmCount,
					AllowedMask:        0,
					DeniedMask:         0,
				})
				includedIDs[parentRow.ID] = struct{}{}
			}

			parentID = parentRow.ParentID
		}
	}

	sort.SliceStable(expandedRows, func(i, j int) bool {
		return compareVisibleInventoryRows(expandedRows[i], expandedRows[j]) < 0
	})

	return expandedRows
}

func compareVisibleInventoryRows(
	left database.GetVisibleInventoryItemsForPrincipalRow,
	right database.GetVisibleInventoryItemsForPrincipalRow,
) int {
	leftOrder := inventoryRowSortOrder(left.Kind)
	rightOrder := inventoryRowSortOrder(right.Kind)
	if leftOrder != rightOrder {
		return leftOrder - rightOrder
	}

	leftLower := strings.ToLower(left.Name)
	rightLower := strings.ToLower(right.Name)
	if leftLower != rightLower {
		if leftLower < rightLower {
			return -1
		}
		return 1
	}

	if left.Name < right.Name {
		return -1
	}
	if left.Name > right.Name {
		return 1
	}

	return 0
}

func toFullAccessInventoryRows(
	rows []database.GetAllInventoryItemsRow,
) []database.GetVisibleInventoryItemsForPrincipalRow {
	visibleRows := make([]database.GetVisibleInventoryItemsForPrincipalRow, 0, len(rows))
	for _, row := range rows {
		visibleRows = append(visibleRows, database.GetVisibleInventoryItemsForPrincipalRow{
			ID:                 row.ID,
			ParentID:           row.ParentID,
			Kind:               row.Kind,
			Name:               row.Name,
			InheritPermissions: true,
			DirectVmLimit:      row.DirectVmLimit,
			EffectiveVmLimit:   row.EffectiveVmLimit,
			VmCount:            row.VmCount,
			Node:               row.Node,
			Vmid:               row.Vmid,
			IsTemplate:         row.IsTemplate,
			Notes:              row.Notes,
			CpuCount:           row.CpuCount,
			MemoryMb:           row.MemoryMb,
			DiskGb:             row.DiskGb,
			AllowedMask:        int64(authorization.FullAccessMask),
			DeniedMask:         0,
		})
	}

	return visibleRows
}

func inventoryRowSortOrder(kind database.InventoryItemKind) int {
	if kind == database.InventoryItemKindFolder {
		return 0
	}

	return 1
}

func (s *Service) GetInventoryItemByID(ctx context.Context, id uuid.UUID) (database.GetInventoryItemByIDRow, error) {
	return database.New(s.db).GetInventoryItemByID(ctx, id)
}

func (s *Service) GetInventoryItemWithPermissions(
	ctx context.Context,
	principalID uuid.UUID,
	id uuid.UUID,
) (database.GetInventoryItemWithPermissionsRow, error) {
	isProtected, err := s.hasProtectedAccess(ctx, principalID)
	if err != nil {
		return database.GetInventoryItemWithPermissionsRow{}, err
	}
	if isProtected {
		row, err := database.New(s.db).GetInventoryItemByID(ctx, id)
		if err != nil {
			return database.GetInventoryItemWithPermissionsRow{}, err
		}

		return database.GetInventoryItemWithPermissionsRow{
			ID:                 row.ID,
			ParentID:           row.ParentID,
			Kind:               row.Kind,
			Name:               row.Name,
			InheritPermissions: row.InheritPermissions,
			DirectVmLimit:      row.DirectVmLimit,
			EffectiveVmLimit:   row.EffectiveVmLimit,
			VmCount:            row.VmCount,
			Node:               row.Node,
			Vmid:               row.Vmid,
			IsTemplate:         row.IsTemplate,
			Notes:              row.Notes,
			CpuCount:           row.CpuCount,
			MemoryMb:           row.MemoryMb,
			DiskGb:             row.DiskGb,
			AllowedMask:        int64(authorization.FullAccessMask),
			DeniedMask:         0,
		}, nil
	}

	return database.New(s.db).GetInventoryItemWithPermissions(ctx, database.GetInventoryItemWithPermissionsParams{
		PrincipalID:     principalID,
		InventoryItemID: id,
	})
}

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

func (s *Service) ResolveFolderPlacement(ctx context.Context, id uuid.UUID) (FolderPlacement, error) {
	rows, err := database.New(s.db).GetAllInventoryItems(ctx)
	if err != nil {
		return FolderPlacement{}, err
	}

	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row
	}

	item, ok := itemsByID[id]
	if !ok {
		return FolderPlacement{}, ErrInventoryFolderNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return FolderPlacement{}, ErrInventoryItemNotFolder
	}

	path := make([]string, 0, 4)
	for current := item; ; {
		if current.ParentID == nil {
			break
		}

		path = append(path, current.Name)

		parent, ok := itemsByID[*current.ParentID]
		if !ok {
			return FolderPlacement{}, ErrInventoryParentNotFound
		}
		current = parent
	}

	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}

	return FolderPlacement{
		FolderID: id,
		Path:     path,
		PoolID:   proxmox.EncodePoolPath(path),
	}, nil
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
				Node:       *current.Node,
				VMID:       *current.Vmid,
				Name:       current.Name,
				IsTemplate: isTemplate,
			})
		}
	}

	walk(id)
	return plan, nil
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
	if isManagedRootFolder(item.ParentID) {
		return ErrInventoryReservedFolder
	}
	if err := ensureFolderDepthForMove(ctx, q, itemID, parentID); err != nil {
		return err
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
	if err := database.New(s.db).DeleteInventoryItem(ctx, itemID); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
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
	s.scheduleMirror()
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
		UpstreamUuid:    upstreamUUID,
		IsTemplate:      isTemplate,
	}); err != nil {
		return uuid.Nil, err
	}

	s.notifyTx(ctx, tx, itemID)

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	s.scheduleMirror()
	return itemID, nil
}

func (s *Service) NotifyInventoryChanged(ctx context.Context, itemID uuid.UUID) {
	s.notify(ctx, nil, &itemID)
	s.scheduleMirror()
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
