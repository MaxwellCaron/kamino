package handlers

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

// folderResourceDeletionCallbacks lets runFolderResourceDeletion be exercised without a real client/DB.
type folderResourceDeletionCallbacks struct {
	deleteVM       func(ctx context.Context, vm inventory.FolderDeletionVM) error
	deletePools    func(ctx context.Context, poolIDs []string) error
	deleteMetadata func(ctx context.Context) error
}

// runFolderResourceDeletion deletes guests, then pools, then metadata in order — any failure stops it there.
func runFolderResourceDeletion(
	ctx context.Context,
	plan inventory.FolderDeletionPlan,
	concurrency int,
	cbs folderResourceDeletionCallbacks,
) error {
	if err := deleteFolderDeletionPlanVMs(ctx, plan.ProxmoxVMs, concurrency, cbs.deleteVM); err != nil {
		return err
	}

	if len(plan.ProxmoxPools) > 0 {
		if err := cbs.deletePools(ctx, plan.ProxmoxPools); err != nil {
			return err
		}
	}

	return cbs.deleteMetadata(ctx)
}

func deleteFolderDeletionPlanVMs(
	ctx context.Context,
	vms []inventory.FolderDeletionVM,
	concurrency int,
	deleteVM func(ctx context.Context, vm inventory.FolderDeletionVM) error,
) error {
	if len(vms) == 0 {
		return nil
	}

	results := runBoundedActions(ctx, concurrency, vms, func(ctx context.Context, index int, vm inventory.FolderDeletionVM) error {
		return deleteVM(ctx, vm)
	})

	var errs []error
	for i, result := range results {
		if result.Err == nil {
			continue
		}
		vm := vms[i]
		kind := "VM"
		if vm.IsTemplate {
			kind = "template"
		}
		errs = append(errs, fmt.Errorf("delete %s %q (node=%s vmid=%d): %w", kind, vm.Name, vm.Node, vm.VMID, result.Err))
	}
	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}

// proxmoxFolderResourceDeleteVM deletes one guest, treating an already-missing guest as success.
func proxmoxFolderResourceDeleteVM(px *proxmox.Client) func(ctx context.Context, vm inventory.FolderDeletionVM) error {
	return func(ctx context.Context, vm inventory.FolderDeletionVM) error {
		err := px.DeleteVMStopped(ctx, proxmox.GuestType(vm.GuestType), vm.Node, int(vm.VMID))
		if err == nil || isMissingProxmoxVMError(err) {
			return nil
		}
		return err
	}
}

// proxmoxFolderResourceDeletionCallbacks wires runFolderResourceDeletion to a real Proxmox client.
func proxmoxFolderResourceDeletionCallbacks(
	px *proxmox.Client,
	deleteMetadata func(ctx context.Context) error,
) folderResourceDeletionCallbacks {
	return folderResourceDeletionCallbacks{
		deleteVM:       proxmoxFolderResourceDeleteVM(px),
		deletePools:    px.DeletePools,
		deleteMetadata: deleteMetadata,
	}
}
