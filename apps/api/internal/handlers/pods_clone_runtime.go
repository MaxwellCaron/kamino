package handlers

import (
	"context"
	"fmt"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
)

func (h *PodsHandler) runtimeForVMIDs(
	ctx context.Context,
	vmids []int,
) (map[int]string, map[int]vmstatus.VMResources, error) {
	statuses := make(map[int]string, len(vmids))
	resources := make(map[int]vmstatus.VMResources, len(vmids))

	if h.Notifier != nil {
		current := h.Notifier.Current()
		for _, vmid := range vmids {
			if status, ok := current[vmid]; ok {
				statuses[vmid] = status
			}
			if resource, ok := h.Notifier.Resources(vmid); ok {
				resources[vmid] = resource
			}
		}
	}

	if len(statuses) == len(uniqueInts(vmids)) {
		return statuses, resources, nil
	}

	vms, err := h.PX.GetVMs(ctx)
	if err != nil {
		if h.Notifier != nil {
			return statuses, resources, nil
		}
		return nil, nil, err
	}
	for _, vm := range vms {
		statuses[vm.VMID] = vm.Status
		resources[vm.VMID] = vmResourcesFromProxmoxVM(vm)
	}

	return statuses, resources, nil
}

func (h *PodsHandler) getVMStatus(ctx context.Context, vmid int) (string, error) {
	statuses, _, err := h.runtimeForVMIDs(ctx, []int{vmid})
	if err != nil {
		return "", err
	}
	status, ok := statuses[vmid]
	if !ok {
		return "", fmt.Errorf("vm %d not found", vmid)
	}
	return status, nil
}

func (h *PodsHandler) waitForVMStatus(ctx context.Context, vmid int, expected string) error {
	if h.Notifier != nil {
		if err := h.Notifier.RefreshUntilStatus(ctx, vmid, expected); err == nil {
			return nil
		}
	}

	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		status, err := h.getVMStatus(ctx, vmid)
		if err != nil {
			return err
		}
		if status == expected {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline:
			return fmt.Errorf("vm %d did not reach %s", vmid, expected)
		case <-ticker.C:
		}
	}
}

func vmResourcesFromProxmoxVM(vm proxmox.VM) vmstatus.VMResources {
	return vmstatus.VMResources{
		CPU:       vm.CPU,
		MaxCPU:    vm.MaxCPU,
		Mem:       vm.Mem,
		MaxMem:    vm.MaxMem,
		Disk:      vm.Disk,
		MaxDisk:   vm.MaxDisk,
		NetIn:     vm.NetIn,
		NetOut:    vm.NetOut,
		DiskRead:  vm.DiskRead,
		DiskWrite: vm.DiskWrite,
		Uptime:    vm.Uptime,
	}
}

func clonedPodRuntimeStatus(statuses []string) string {
	if len(statuses) == 0 {
		return "partial"
	}

	allRunning := true
	allStopped := true
	for _, status := range statuses {
		allRunning = allRunning && status == "running"
		allStopped = allStopped && status == "stopped"
	}

	if allRunning {
		return "running"
	}
	if allStopped {
		return "stopped"
	}
	return "partial"
}
