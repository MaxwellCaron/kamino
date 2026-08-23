package handlers

import (
	"context"
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

func (h *PodsHandler) waitForVMStatuses(
	ctx context.Context,
	expected map[int]string,
) ([]int, error) {
	if len(expected) == 0 {
		return nil, nil
	}

	if h.Notifier != nil {
		if err := h.Notifier.RefreshUntilStatuses(ctx, expected); err == nil {
			return nil, nil
		}
	}

	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		statuses, _, err := h.runtimeForVMIDs(ctx, vmidsFromExpectedStatuses(expected))
		if err != nil {
			return nil, err
		}

		unconfirmed := unconfirmedVMStatuses(expected, statuses)
		if len(unconfirmed) == 0 {
			return nil, nil
		}

		select {
		case <-ctx.Done():
			return unconfirmed, ctx.Err()
		case <-deadline:
			return unconfirmedVMStatuses(expected, statuses), nil
		case <-ticker.C:
		}
	}
}

func vmidsFromExpectedStatuses(expected map[int]string) []int {
	vmids := make([]int, 0, len(expected))
	for vmid := range expected {
		vmids = append(vmids, vmid)
	}
	return vmids
}

func unconfirmedVMStatuses(expected map[int]string, statuses map[int]string) []int {
	unconfirmed := make([]int, 0)
	for vmid, want := range expected {
		if statuses[vmid] != want {
			unconfirmed = append(unconfirmed, vmid)
		}
	}
	return unconfirmed
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
