package inventory

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ACLEntryInput struct {
	PrincipalID uuid.UUID
	Effect      database.InventoryAceEffect
	Permissions int64
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

	treeRows, err := q.GetVisibleInventoryTreeForPrincipal(ctx, principalID)
	if err != nil {
		return nil, err
	}
	return convertTreeRowsToVisibleRows(treeRows), nil
}

func convertTreeRowsToVisibleRows(
	rows []database.GetVisibleInventoryTreeForPrincipalRow,
) []database.GetVisibleInventoryItemsForPrincipalRow {
	result := make([]database.GetVisibleInventoryItemsForPrincipalRow, len(rows))
	for i, r := range rows {
		result[i] = database.GetVisibleInventoryItemsForPrincipalRow{
			ID:                 r.ID,
			ParentID:           r.ParentID,
			Kind:               r.Kind,
			Name:               r.Name,
			InheritPermissions: r.InheritPermissions,
			DirectVmLimit:      r.DirectVmLimit,
			EffectiveVmLimit:   r.EffectiveVmLimit,
			VmCount:            r.VmCount,
			Node:               r.Node,
			Vmid:               r.Vmid,
			IsTemplate:         r.IsTemplate,
			Notes:              r.Notes,
			CpuCount:           r.CpuCount,
			MemoryMb:           r.MemoryMb,
			DiskGb:             r.DiskGb,
			AllowedMask:        r.AllowedMask,
			DeniedMask:         r.DeniedMask,
		}
	}
	return result
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

func (s *Service) GetInventoryItemsWithPermissions(
	ctx context.Context,
	principalID uuid.UUID,
	ids []uuid.UUID,
) (map[uuid.UUID]database.GetInventoryItemWithPermissionsRow, error) {
	isProtected, err := s.hasProtectedAccess(ctx, principalID)
	if err != nil {
		return nil, err
	}

	result := make(map[uuid.UUID]database.GetInventoryItemWithPermissionsRow, len(ids))

	if isProtected {
		for _, id := range ids {
			row, err := database.New(s.db).GetInventoryItemByID(ctx, id)
			if err != nil {
				return nil, err
			}
			result[row.ID] = database.GetInventoryItemWithPermissionsRow{
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
			}
		}
		return result, nil
	}

	rows, err := database.New(s.db).GetInventoryItemsWithPermissions(ctx, database.GetInventoryItemsWithPermissionsParams{
		PrincipalID: principalID,
		ItemIds:     ids,
	})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ID] = database.GetInventoryItemWithPermissionsRow{
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
			AllowedMask:        row.AllowedMask,
			DeniedMask:         row.DeniedMask,
		}
	}
	return result, nil
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
