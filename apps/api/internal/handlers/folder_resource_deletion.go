package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

// folderResourceDeletionCallbacks lets runFolderResourceDeletion be exercised without a real client/DB.
type folderResourceDeletionCallbacks struct {
	preparePlan    func(ctx context.Context, plan inventory.FolderDeletionPlan, concurrency int) (inventory.FolderDeletionPlan, error)
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
	if cbs.preparePlan != nil {
		prepared, err := cbs.preparePlan(ctx, plan, concurrency)
		if err != nil {
			return err
		}
		plan = prepared
	}

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

type folderDeletionSafetyCallbacks struct {
	listVMs     func(context.Context) ([]proxmox.VM, error)
	getIdentity func(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error)
	preserveVM  func(context.Context, inventory.FolderDeletionVM, string) error
}

type folderDeletionVMDecision struct {
	delete       bool
	absent       bool
	preservePool string
}

func prepareFolderDeletionPlan(
	ctx context.Context,
	plan inventory.FolderDeletionPlan,
	concurrency int,
	cbs folderDeletionSafetyCallbacks,
) (inventory.FolderDeletionPlan, error) {
	if len(plan.ProxmoxVMs) == 0 {
		return plan, nil
	}
	if plan.RootPoolID == "" {
		return inventory.FolderDeletionPlan{}, fmt.Errorf("folder deletion pool root is required")
	}

	liveVMs, err := cbs.listVMs(ctx)
	if err != nil {
		return inventory.FolderDeletionPlan{}, fmt.Errorf("listing live Proxmox VMs: %w", err)
	}
	liveByLocator := make(map[string]proxmox.VM, len(liveVMs))
	for _, vm := range liveVMs {
		liveByLocator[folderVMLocator(vm.Node, vm.VMID)] = vm
	}

	decisions := make([]folderDeletionVMDecision, len(plan.ProxmoxVMs))
	results := runBoundedActions(ctx, concurrency, plan.ProxmoxVMs, func(ctx context.Context, index int, planned inventory.FolderDeletionVM) error {
		identity, err := cbs.getIdentity(ctx, proxmox.GuestType(planned.GuestType), planned.Node, int(planned.VMID))
		if err != nil {
			if proxmox.IsMissingVMError(err) {
				decisions[index].absent = true
				return nil
			}
			return fmt.Errorf("verifying VM %d on %s identity: %w", planned.VMID, planned.Node, err)
		}
		if identity == nil || identity.UpstreamUUID != planned.UpstreamUUID {
			return fmt.Errorf("VM %d on %s identity no longer matches Kamino", planned.VMID, planned.Node)
		}

		live, exists := liveByLocator[folderVMLocator(planned.Node, int(planned.VMID))]
		if !exists {
			return fmt.Errorf("VM %d on %s live pool placement is unavailable", planned.VMID, planned.Node)
		}
		if proxmox.GuestTypeFromVMType(live.Type) != proxmox.GuestType(planned.GuestType) {
			return fmt.Errorf("VM %d on %s changed guest type", planned.VMID, planned.Node)
		}

		if poolInDeletionHierarchy(live.Pool, plan.RootPoolID) {
			decisions[index].delete = true
		} else {
			decisions[index].preservePool = live.Pool
		}
		return nil
	})

	var verifyErrs []error
	for _, result := range results {
		if result.Err != nil {
			verifyErrs = append(verifyErrs, result.Err)
		}
	}
	if len(verifyErrs) > 0 {
		return inventory.FolderDeletionPlan{}, errors.Join(verifyErrs...)
	}

	prepared := plan
	prepared.ProxmoxVMs = make([]inventory.FolderDeletionVM, 0, len(plan.ProxmoxVMs))
	for i, decision := range decisions {
		vm := plan.ProxmoxVMs[i]
		if decision.delete {
			prepared.ProxmoxVMs = append(prepared.ProxmoxVMs, vm)
			continue
		}
		if decision.absent {
			continue
		}
		if err := cbs.preserveVM(ctx, vm, decision.preservePool); err != nil {
			return inventory.FolderDeletionPlan{}, fmt.Errorf("preserving VM %d on %s: %w", vm.VMID, vm.Node, err)
		}
	}

	return prepared, nil
}

func folderVMLocator(node string, vmid int) string {
	return fmt.Sprintf("%s/%d", node, vmid)
}

func poolInDeletionHierarchy(poolID, rootPoolID string) bool {
	return poolID == rootPoolID || strings.HasPrefix(poolID, rootPoolID+"/")
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
		if err == nil || proxmox.IsMissingVMError(err) {
			return nil
		}
		return err
	}
}

// proxmoxFolderResourceDeletionCallbacks wires runFolderResourceDeletion to a real Proxmox client.
func proxmoxFolderResourceDeletionCallbacks(
	px *proxmox.Client,
	service *inventory.Service,
	deleteMetadata func(ctx context.Context) error,
) folderResourceDeletionCallbacks {
	return folderResourceDeletionCallbacks{
		preparePlan:    proxmoxFolderDeletionPlanPreparer(px, service),
		deleteVM:       proxmoxFolderResourceDeleteVM(px),
		deletePools:    px.DeletePools,
		deleteMetadata: deleteMetadata,
	}
}

func proxmoxFolderDeletionPlanPreparer(
	px *proxmox.Client,
	service *inventory.Service,
) func(context.Context, inventory.FolderDeletionPlan, int) (inventory.FolderDeletionPlan, error) {
	return func(ctx context.Context, plan inventory.FolderDeletionPlan, concurrency int) (inventory.FolderDeletionPlan, error) {
		return prepareFolderDeletionPlan(ctx, plan, concurrency, folderDeletionSafetyCallbacks{
			listVMs:     px.GetVMs,
			getIdentity: px.GetVMIdentity,
			preserveVM: func(ctx context.Context, vm inventory.FolderDeletionVM, poolID string) error {
				var path []string
				if poolID != "" {
					path = strings.Split(poolID, "/")
				}
				parentID, err := service.EnsureFolderPath(ctx, path)
				if err != nil {
					return err
				}
				return service.MoveInventoryItem(ctx, vm.InventoryItemID, parentID)
			},
		})
	}
}
