package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

type failedPodProvisionCleanupCallbacks struct {
	waitCloneTask     func(ctx context.Context, node, upid string) error
	deleteProxmoxVM   func(ctx context.Context, node string, vmid int) error
	deleteInventoryVM func(ctx context.Context, itemID uuid.UUID) error
	deleteFolder      func(ctx context.Context, folderID uuid.UUID) error
}

func runFailedPodProvisionCleanup(
	ctx context.Context,
	folderID uuid.UUID,
	created map[int]clonedVM,
	concurrency int,
	cbs failedPodProvisionCleanupCallbacks,
) error {
	vmids := make([]int, 0, len(created))
	for vmid := range created {
		vmids = append(vmids, vmid)
	}
	slices.Sort(vmids)

	var (
		mu            sync.Mutex
		proxmoxErrs   []error
		inventoryErrs []error
		proxmoxFailed bool
	)

	group := new(errgroup.Group)
	group.SetLimit(concurrency)

	for _, vmid := range vmids {
		clone := created[vmid]
		group.Go(func() error {
			if clone.CloneTask.UPID != "" && cbs.waitCloneTask != nil {
				if err := cbs.waitCloneTask(ctx, clone.CloneTask.Node, clone.CloneTask.UPID); err != nil {
					mu.Lock()
					proxmoxErrs = append(proxmoxErrs, fmt.Errorf(
						"wait for clone task %s on %s: %w",
						clone.CloneTask.UPID,
						clone.CloneTask.Node,
						err,
					))
					mu.Unlock()
				}
			}

			if err := cbs.deleteProxmoxVM(ctx, clone.TargetNode, clone.VMID); err != nil {
				mu.Lock()
				proxmoxFailed = true
				proxmoxErrs = append(proxmoxErrs, fmt.Errorf("delete Proxmox VM %d on %s: %w", clone.VMID, clone.TargetNode, err))
				mu.Unlock()
				return nil
			}
			if clone.InventoryItemID != uuid.Nil {
				if err := cbs.deleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
					mu.Lock()
					inventoryErrs = append(inventoryErrs, fmt.Errorf("delete inventory item %s: %w", clone.InventoryItemID, err))
					mu.Unlock()
				}
			}
			return nil
		})
	}

	_ = group.Wait()

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

	if err := runFailedPodProvisionCleanup(ctx, folderID, created, h.podProvisionConcurrencyLimit(), failedPodProvisionCleanupCallbacks{
		waitCloneTask:     h.PX.WaitForTask,
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

func (h *PodsHandler) cleanupPublishClones(created map[int]clonedVM) {
	h.cleanupFailedPodProvision(uuid.Nil, created)
}
