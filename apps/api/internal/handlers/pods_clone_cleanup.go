package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"time"

	"github.com/google/uuid"
)

type failedPodProvisionCleanupCallbacks struct {
	deleteProxmoxVM   func(ctx context.Context, node string, vmid int) error
	deleteInventoryVM func(ctx context.Context, itemID uuid.UUID) error
	deleteFolder      func(ctx context.Context, folderID uuid.UUID) error
}

func runFailedPodProvisionCleanup(
	ctx context.Context,
	folderID uuid.UUID,
	created map[int]clonedVM,
	cbs failedPodProvisionCleanupCallbacks,
) error {
	vmids := make([]int, 0, len(created))
	for vmid := range created {
		vmids = append(vmids, vmid)
	}
	slices.Sort(vmids)

	var proxmoxErrs []error
	var inventoryErrs []error
	proxmoxFailed := false

	for _, vmid := range vmids {
		clone := created[vmid]
		if err := cbs.deleteProxmoxVM(ctx, clone.TargetNode, clone.VMID); err != nil {
			proxmoxFailed = true
			proxmoxErrs = append(proxmoxErrs, fmt.Errorf("delete Proxmox VM %d on %s: %w", clone.VMID, clone.TargetNode, err))
			continue
		}
		if clone.InventoryItemID != uuid.Nil {
			if err := cbs.deleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
				inventoryErrs = append(inventoryErrs, fmt.Errorf("delete inventory item %s: %w", clone.InventoryItemID, err))
			}
		}
	}

	if proxmoxFailed {
		return errors.Join(append(proxmoxErrs, inventoryErrs...)...)
	}

	if folderID != uuid.Nil {
		if err := cbs.deleteFolder(ctx, folderID); err != nil {
			return errors.Join(append(inventoryErrs, fmt.Errorf("delete target folder %s: %w", folderID, err))...)
		}
		return nil
	}

	return errors.Join(inventoryErrs...)
}

func (h *PodsHandler) cleanupFailedPodProvision(folderID uuid.UUID, created map[int]clonedVM) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if err := runFailedPodProvisionCleanup(ctx, folderID, created, failedPodProvisionCleanupCallbacks{
		deleteProxmoxVM:   h.deleteClonedPodProxmoxVM,
		deleteInventoryVM: h.Service.DeleteInventoryVM,
		deleteFolder:      h.Service.DeleteFolder,
	}); err != nil {
		log.Printf("clone cleanup: pod-provision cleanup incomplete for folder %s: %v", folderID, err)
	}
}

func (h *PodsHandler) cleanupFailedUserClone(folderID uuid.UUID, created map[int]clonedVM) {
	h.cleanupFailedPodProvision(folderID, created)
}
