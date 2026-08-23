package authorization

import (
	"context"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func (s *Service) ResolveVMItemID(
	ctx context.Context,
	node string,
	vmid int32,
) (uuid.UUID, error) {
	return database.New(s.db).GetInventoryItemIDByProxmoxVM(ctx, database.GetInventoryItemIDByProxmoxVMParams{
		Node: node,
		Vmid: vmid,
	})
}

func (s *Service) GetVMRecord(ctx context.Context, itemID uuid.UUID) (VMRecord, error) {
	row, err := database.New(s.db).GetProxmoxVMByInventoryItemID(ctx, itemID)
	if err != nil {
		return VMRecord{}, err
	}

	return VMRecord{
		InventoryItemID: row.InventoryItemID,
		Node:            row.Node,
		Vmid:            row.Vmid,
		UpstreamUUID:    row.UpstreamUuid,
		GuestType:       row.GuestType,
	}, nil
}

func (s *Service) ResolveVMItems(
	ctx context.Context,
	principalID uuid.UUID,
	itemIDs []uuid.UUID,
	required Mask,
	lock bool,
) (map[uuid.UUID]VMItemAccess, error) {
	result := make(map[uuid.UUID]VMItemAccess, len(itemIDs))
	if len(itemIDs) == 0 {
		return result, nil
	}

	q := database.New(s.db)
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return nil, err
	}

	if isAdmin {
		if lock {
			rows, err := q.GetBulkVMItemsForUpdate(ctx, itemIDs)
			if err != nil {
				return nil, err
			}

			for _, row := range rows {
				access := VMItemAccess{Allowed: true}
				if hasVMFlag(row.HasVm) {
					access.HasVM = true
					access.Record = VMRecord{
						InventoryItemID: row.ID,
						Node:            row.Node,
						Vmid:            row.Vmid,
						UpstreamUUID:    row.UpstreamUuid,
						GuestType:       row.GuestType,
					}
				}
				result[row.ID] = access
			}
		} else {
			rows, err := q.GetBulkVMItems(ctx, itemIDs)
			if err != nil {
				return nil, err
			}

			for _, row := range rows {
				access := VMItemAccess{Allowed: true}
				if hasVMFlag(row.HasVm) {
					access.HasVM = true
					access.Record = VMRecord{
						InventoryItemID: row.ID,
						Node:            row.Node,
						Vmid:            row.Vmid,
						UpstreamUUID:    row.UpstreamUuid,
						GuestType:       row.GuestType,
					}
				}
				result[row.ID] = access
			}
		}

		return result, nil
	}

	if lock {
		rows, err := q.GetBulkVMItemsWithPermissionsForUpdate(ctx, database.GetBulkVMItemsWithPermissionsForUpdateParams{
			PrincipalID: principalID,
			ItemIds:     itemIDs,
		})
		if err != nil {
			return nil, err
		}

		for _, row := range rows {
			access := VMItemAccess{
				Allowed: Mask(row.AllowedMask).Has(required),
			}
			if hasVMFlag(row.HasVm) {
				access.HasVM = true
				access.Record = VMRecord{
					InventoryItemID: row.ID,
					Node:            row.Node,
					Vmid:            row.Vmid,
					UpstreamUUID:    row.UpstreamUuid,
					GuestType:       row.GuestType,
				}
			}
			result[row.ID] = access
		}
	} else {
		rows, err := q.GetBulkVMItemsWithPermissions(ctx, database.GetBulkVMItemsWithPermissionsParams{
			PrincipalID: principalID,
			ItemIds:     itemIDs,
		})
		if err != nil {
			return nil, err
		}

		for _, row := range rows {
			access := VMItemAccess{
				Allowed: Mask(row.AllowedMask).Has(required),
			}
			if hasVMFlag(row.HasVm) {
				access.HasVM = true
				access.Record = VMRecord{
					InventoryItemID: row.ID,
					Node:            row.Node,
					Vmid:            row.Vmid,
					UpstreamUUID:    row.UpstreamUuid,
					GuestType:       row.GuestType,
				}
			}
			result[row.ID] = access
		}
	}

	return result, nil
}

// GetVMRecordForUpdate uses SELECT ... FOR UPDATE for mutation paths. With the
// current pool-backed callers it does not serialize the full verify-then-act
// window; vm_action_claims is the actual mutation boundary. The row lock only
// persists for the lifetime of a surrounding transaction.
func (s *Service) GetVMRecordForUpdate(ctx context.Context, itemID uuid.UUID) (VMRecord, error) {
	row, err := database.New(s.db).GetProxmoxVMByInventoryItemIDForUpdate(ctx, itemID)
	if err != nil {
		return VMRecord{}, err
	}

	return VMRecord{
		InventoryItemID: row.InventoryItemID,
		Node:            row.Node,
		Vmid:            row.Vmid,
		UpstreamUUID:    row.UpstreamUuid,
		GuestType:       row.GuestType,
	}, nil
}

func (s *Service) FilterVisibleStatuses(
	ctx context.Context,
	principalID uuid.UUID,
	statuses map[int]string,
) (map[int]string, error) {
	isAdmin, err := s.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		filtered := make(map[int]string, len(statuses))
		for vmid, status := range statuses {
			filtered[vmid] = status
		}
		return filtered, nil
	}

	visibleVMIDs, err := database.New(s.db).ListVisibleVMIDsForPrincipal(ctx, principalID)
	if err != nil {
		return nil, err
	}

	filtered := make(map[int]string, len(visibleVMIDs))
	for _, vmid := range visibleVMIDs {
		status, ok := statuses[int(vmid)]
		if ok {
			filtered[int(vmid)] = status
		}
	}

	return filtered, nil
}
