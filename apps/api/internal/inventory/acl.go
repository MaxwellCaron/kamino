package inventory

import (
	"context"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
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
			Description:        r.Description,
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
			Description:        row.Description,
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
			Description:        row.Description,
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
				Description:        row.Description,
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
			Description:        row.Description,
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
