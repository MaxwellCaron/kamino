package proxmox

import (
	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

const proxmoxRootFolderName = "Proxmox"

func findManagedRootFolderID(rows []database.GetAllInventoryItemsRow) *uuid.UUID {
	var (
		namedRootID *uuid.UUID
		soleRootID  *uuid.UUID
		rootCount   int
	)

	for _, row := range rows {
		if row.ParentID != nil || row.Kind != database.InventoryItemKindFolder {
			continue
		}

		rootCount++
		id := row.ID
		if row.Name == proxmoxRootFolderName {
			namedRootID = &id
		}
		if soleRootID == nil {
			soleRootID = &id
		}
	}

	if namedRootID != nil {
		return namedRootID
	}
	if rootCount == 1 {
		return soleRootID
	}

	return nil
}
