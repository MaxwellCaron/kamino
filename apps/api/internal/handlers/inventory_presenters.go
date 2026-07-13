package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func buildTree(rows []database.GetVisibleInventoryItemsForPrincipalRow) []TreeNode {
	nodes := make(map[uuid.UUID]*TreeNode, len(rows))
	childMap := make(map[uuid.UUID][]uuid.UUID, len(rows))

	for _, row := range rows {
		node := &TreeNode{
			ID:               row.ID,
			Name:             row.Name,
			Kind:             string(row.Kind),
			Description:      row.Description,
			DirectVMLimit:    row.DirectVmLimit,
			EffectiveVMLimit: positiveInt32Ptr(row.EffectiveVmLimit),
			VMCount:          folderCountPtr(row.Kind, row.VmCount),
			Permissions:      inventoryPermissionEnvelope(row.Kind, row.AllowedMask, row.DeniedMask),
		}

		if row.Node != nil {
			node.VM = toVMDetail(row.Node, row.Vmid, row.GuestType, row.IsTemplate, row.Notes, row.CpuCount, row.MemoryMb, row.DiskGb)
		}

		nodes[row.ID] = node
	}

	rootIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.ParentID != nil {
			if _, ok := nodes[*row.ParentID]; ok {
				childMap[*row.ParentID] = append(childMap[*row.ParentID], row.ID)
				continue
			}
		}
		rootIDs = append(rootIDs, row.ID)
	}

	var assemble func(id uuid.UUID) TreeNode
	assemble = func(id uuid.UUID) TreeNode {
		node := *nodes[id]
		if children, ok := childMap[id]; ok {
			node.Children = make([]TreeNode, 0, len(children))
			for _, childID := range children {
				node.Children = append(node.Children, assemble(childID))
			}
		}
		return node
	}

	tree := make([]TreeNode, 0, len(rootIDs))
	for _, id := range rootIDs {
		tree = append(tree, assemble(id))
	}
	return tree
}

func buildInventoryItem(row database.GetInventoryItemWithPermissionsRow) InventoryItem {
	item := InventoryItem{
		ID:                 row.ID,
		ParentID:           row.ParentID,
		Kind:               string(row.Kind),
		Name:               row.Name,
		Description:        row.Description,
		InheritPermissions: row.InheritPermissions,
		DirectVMLimit:      row.DirectVmLimit,
		EffectiveVMLimit:   positiveInt32Ptr(row.EffectiveVmLimit),
		VMCount:            folderCountPtr(row.Kind, row.VmCount),
		Permissions:        inventoryPermissionEnvelope(row.Kind, row.AllowedMask, row.DeniedMask),
	}

	if row.Node != nil {
		item.VM = toVMDetail(
			row.Node,
			row.Vmid,
			row.GuestType,
			row.IsTemplate,
			row.Notes,
			row.CpuCount,
			row.MemoryMb,
			row.DiskGb,
		)
	}

	return item
}

func positiveInt32Ptr(value int32) *int32 {
	if value <= 0 {
		return nil
	}
	return &value
}

func folderCountPtr(kind database.InventoryItemKind, count int32) *int32 {
	if kind != database.InventoryItemKindFolder {
		return nil
	}
	return &count
}

func toVMDetail(node *string, vmid *int32, guestType *string, isTemplate *bool, notes *string, cpuCount, memoryMB *int32, diskGB *float64) *VMDetail {
	vm := &VMDetail{
		Notes:     notes,
		CPUCount:  cpuCount,
		MemoryMB:  memoryMB,
		DiskGB:    diskGB,
		GuestType: "qemu",
	}
	if guestType != nil && *guestType != "" {
		vm.GuestType = *guestType
	}
	if node != nil {
		vm.Node = *node
	}
	if vmid != nil {
		vm.VMID = *vmid
	}
	if isTemplate != nil {
		vm.IsTemplate = *isTemplate
	}
	return vm
}

func inventoryPermissionEnvelope(
	kind database.InventoryItemKind,
	allowedMask int64,
	deniedMask int64,
) PermissionEnvelope {
	targetKind := authorization.InventoryPermissionTargetKindVM
	if kind == database.InventoryItemKindFolder {
		targetKind = authorization.InventoryPermissionTargetKindFolder
	}

	return toPermissionEnvelope(
		authorization.EffectivePermissionsForTargetKind(
			targetKind,
			authorization.Mask(allowedMask),
			authorization.Mask(deniedMask),
		),
	)
}

func writeInventoryError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		writeLoggedError(c, http.StatusNotFound, err.Error(), "inventory lookup", err)
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, inventory.ErrInventoryFolderDepthExceeded),
		errors.Is(err, inventory.ErrInventoryInvalidFolderLimit),
		errors.Is(err, inventory.ErrInventoryDescriptionTooLong),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithAlnum),
		errors.Is(err, names.ErrInvalidCharacters):
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "inventory validation", err)
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict),
		errors.Is(err, inventory.ErrInventoryFolderLimitExceeded),
		errors.Is(err, inventory.ErrInventoryItemInUse):
		writeLoggedError(c, http.StatusConflict, err.Error(), "inventory conflict", err)
	default:
		writeLoggedError(c, http.StatusInternalServerError, "inventory mutation failed", "inventory mutation", err)
	}
}
