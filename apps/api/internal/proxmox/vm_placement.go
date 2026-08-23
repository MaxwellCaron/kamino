package proxmox

import (
	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

// VMPoolPlacement is one VM's desired Proxmox pool, derived from its Kamino folder location.
type VMPoolPlacement struct {
	Node        string
	VMID        int
	GuestType   string
	DesiredPool string
}

// DesiredVMPoolPlacements returns the desired pool for every VM nested under any of the given inventory item IDs.
func DesiredVMPoolPlacements(rows []database.GetAllInventoryItemsRow, itemIDs []uuid.UUID) ([]VMPoolPlacement, error) {
	state, err := buildDesiredPoolState(rows)
	if err != nil {
		return nil, err
	}

	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row
		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}

	var placements []VMPoolPlacement
	var walk func(uuid.UUID)
	walk = func(id uuid.UUID) {
		item, ok := itemsByID[id]
		if !ok {
			return
		}

		if item.Kind == database.InventoryItemKindFolder {
			for _, childID := range childrenByParent[id] {
				walk(childID)
			}
			return
		}

		if item.Node == nil || item.Vmid == nil {
			return
		}

		gt := "qemu"
		if item.GuestType != nil {
			gt = *item.GuestType
		}
		key := vmKey{Node: *item.Node, VMID: int(*item.Vmid), GuestType: GuestType(gt)}
		placements = append(placements, VMPoolPlacement{
			Node:        *item.Node,
			VMID:        int(*item.Vmid),
			GuestType:   gt,
			DesiredPool: state.vmPools[key],
		})
	}

	for _, id := range itemIDs {
		walk(id)
	}

	return placements, nil
}
