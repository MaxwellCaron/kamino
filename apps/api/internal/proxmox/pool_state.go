package proxmox

import (
	"errors"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

type vmKey struct {
	Node      string
	VMID      int
	GuestType GuestType
}

func buildInventoryIndex(rows []database.GetAllInventoryItemsRow) (*uuid.UUID, map[uuid.UUID]database.GetAllInventoryItemsRow, map[uuid.UUID][]uuid.UUID) {
	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row

		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}

	return FindManagedRootFolderID(rows), itemsByID, childrenByParent
}

// desiredPoolState maps inventory folders to Proxmox pool paths.
type desiredPoolState struct {
	poolFolderID map[string]uuid.UUID
	poolComment  map[string]*string
	vmPools      map[vmKey]string
}

// ErrAmbiguousManagedRoot is returned when multiple parentless folders exist and none is the canonical root.
var ErrAmbiguousManagedRoot = errors.New("cannot resolve the managed root folder unambiguously")

func buildDesiredPoolState(rows []database.GetAllInventoryItemsRow) (desiredPoolState, error) {
	rootID, itemsByID, childrenByParent := buildInventoryIndex(rows)

	state := desiredPoolState{
		poolFolderID: make(map[string]uuid.UUID),
		poolComment:  make(map[string]*string),
		vmPools:      make(map[vmKey]string),
	}
	if rootID == nil {
		if countRootFolders(rows) > 1 {
			return state, ErrAmbiguousManagedRoot
		}
		return state, nil
	}

	var walk func(uuid.UUID, []string)
	walk = func(id uuid.UUID, path []string) {
		row := itemsByID[id]
		nextPath := path

		if id != *rootID && row.Kind == database.InventoryItemKindFolder {
			nextPath = appendPath(path, row.Name)
			poolID := EncodePoolPath(nextPath)
			state.poolFolderID[poolID] = id
			state.poolComment[poolID] = row.Description
		}

		for _, childID := range childrenByParent[id] {
			child := itemsByID[childID]
			if child.Kind == database.InventoryItemKindFolder {
				walk(childID, nextPath)
				continue
			}

			if child.Node == nil || child.Vmid == nil {
				continue
			}

			gt := GuestQEMU
			if child.GuestType != nil {
				gt = GuestType(*child.GuestType)
			}
			key := vmKey{Node: *child.Node, VMID: int(*child.Vmid), GuestType: gt}
			desiredPool := ""
			if len(nextPath) > 0 {
				desiredPool = EncodePoolPath(nextPath)
			}

			state.vmPools[key] = desiredPool
		}
	}

	walk(*rootID, nil)
	return state, nil
}

// DesiredPoolForFolder returns the desired Proxmox pool ID and comment for a single inventory folder.
func DesiredPoolForFolder(rows []database.GetAllInventoryItemsRow, folderID uuid.UUID) (poolID string, comment *string, err error) {
	state, err := buildDesiredPoolState(rows)
	if err != nil {
		return "", nil, err
	}
	for pid, fid := range state.poolFolderID {
		if fid == folderID {
			return pid, state.poolComment[pid], nil
		}
	}
	return "", nil, nil
}

func countRootFolders(rows []database.GetAllInventoryItemsRow) int {
	count := 0
	for _, row := range rows {
		if row.ParentID == nil && row.Kind == database.InventoryItemKindFolder {
			count++
		}
	}
	return count
}

func appendPath(path []string, segment string) []string {
	next := make([]string, 0, len(path)+1)
	next = append(next, path...)
	next = append(next, segment)
	return next
}

func EncodePoolPath(path []string) string {
	return strings.Join(path, "/")
}
