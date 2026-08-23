package handlers

import (
	"context"
	"errors"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
)

func TestPrepareFolderDeletionPlanPreservesVMThatMovedOutsideHierarchy(t *testing.T) {
	upstreamUUID := uuid.New()
	vm := inventory.FolderDeletionVM{
		InventoryItemID: uuid.New(),
		Node:            "node1",
		VMID:            101,
		GuestType:       "qemu",
		UpstreamUUID:    upstreamUUID,
	}
	plan := inventory.FolderDeletionPlan{
		ProxmoxVMs: []inventory.FolderDeletionVM{vm},
		RootPoolID: "Pods/deleted",
	}

	var preservedPool string
	prepared, err := prepareFolderDeletionPlan(context.Background(), plan, 2, folderDeletionSafetyCallbacks{
		listVMs: func(context.Context) ([]proxmox.VM, error) {
			return []proxmox.VM{{Node: "node1", VMID: 101, Type: "qemu", Pool: "Personal/safe"}}, nil
		},
		getIdentity: func(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error) {
			return &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}, nil
		},
		preserveVM: func(_ context.Context, got inventory.FolderDeletionVM, poolID string) error {
			if got.InventoryItemID != vm.InventoryItemID {
				t.Fatalf("preserved item = %s, want %s", got.InventoryItemID, vm.InventoryItemID)
			}
			preservedPool = poolID
			return nil
		},
	})
	if err != nil {
		t.Fatalf("prepareFolderDeletionPlan() error = %v", err)
	}
	if len(prepared.ProxmoxVMs) != 0 {
		t.Fatalf("prepared VM deletes = %d, want 0", len(prepared.ProxmoxVMs))
	}
	if preservedPool != "Personal/safe" {
		t.Fatalf("preserved pool = %q, want Personal/safe", preservedPool)
	}
}

func TestPrepareFolderDeletionPlanDeletesVerifiedVMInsideHierarchy(t *testing.T) {
	upstreamUUID := uuid.New()
	vm := inventory.FolderDeletionVM{
		InventoryItemID: uuid.New(), Node: "node1", VMID: 101,
		GuestType: "qemu", UpstreamUUID: upstreamUUID,
	}
	plan := inventory.FolderDeletionPlan{
		ProxmoxVMs: []inventory.FolderDeletionVM{vm},
		RootPoolID: "Pods/deleted",
	}

	prepared, err := prepareFolderDeletionPlan(context.Background(), plan, 2, folderDeletionSafetyCallbacks{
		listVMs: func(context.Context) ([]proxmox.VM, error) {
			return []proxmox.VM{{Node: "node1", VMID: 101, Type: "qemu", Pool: "Pods/deleted/VMs"}}, nil
		},
		getIdentity: func(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error) {
			return &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}, nil
		},
		preserveVM: func(context.Context, inventory.FolderDeletionVM, string) error {
			t.Fatal("preserveVM should not be called")
			return nil
		},
	})
	if err != nil {
		t.Fatalf("prepareFolderDeletionPlan() error = %v", err)
	}
	if len(prepared.ProxmoxVMs) != 1 || prepared.ProxmoxVMs[0].InventoryItemID != vm.InventoryItemID {
		t.Fatalf("prepared VM deletes = %+v, want original VM", prepared.ProxmoxVMs)
	}
}

func TestPrepareFolderDeletionPlanStopsBeforePreservingOnIdentityMismatch(t *testing.T) {
	vm := inventory.FolderDeletionVM{
		InventoryItemID: uuid.New(), Node: "node1", VMID: 101,
		GuestType: "qemu", UpstreamUUID: uuid.New(),
	}
	plan := inventory.FolderDeletionPlan{
		ProxmoxVMs: []inventory.FolderDeletionVM{vm},
		RootPoolID: "Pods/deleted",
	}
	preserveCalled := false

	_, err := prepareFolderDeletionPlan(context.Background(), plan, 2, folderDeletionSafetyCallbacks{
		listVMs: func(context.Context) ([]proxmox.VM, error) {
			return []proxmox.VM{{Node: "node1", VMID: 101, Type: "qemu", Pool: "Personal/safe"}}, nil
		},
		getIdentity: func(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error) {
			return &proxmox.VMIdentity{UpstreamUUID: uuid.New()}, nil
		},
		preserveVM: func(context.Context, inventory.FolderDeletionVM, string) error {
			preserveCalled = true
			return nil
		},
	})
	if err == nil {
		t.Fatal("prepareFolderDeletionPlan() error = nil, want identity mismatch")
	}
	if preserveCalled {
		t.Fatal("preserveVM called before all identities verified")
	}
}

func TestPrepareFolderDeletionPlanTreatsMissingVMAsAlreadyDeleted(t *testing.T) {
	vm := inventory.FolderDeletionVM{
		InventoryItemID: uuid.New(), Node: "node1", VMID: 101,
		GuestType: "qemu", UpstreamUUID: uuid.New(),
	}
	plan := inventory.FolderDeletionPlan{
		ProxmoxVMs: []inventory.FolderDeletionVM{vm},
		RootPoolID: "Pods/deleted",
	}

	prepared, err := prepareFolderDeletionPlan(context.Background(), plan, 2, folderDeletionSafetyCallbacks{
		listVMs: func(context.Context) ([]proxmox.VM, error) { return nil, nil },
		getIdentity: func(context.Context, proxmox.GuestType, string, int) (*proxmox.VMIdentity, error) {
			return nil, errors.New("VM does not exist")
		},
		preserveVM: func(context.Context, inventory.FolderDeletionVM, string) error {
			t.Fatal("preserveVM should not be called")
			return nil
		},
	})
	if err != nil {
		t.Fatalf("prepareFolderDeletionPlan() error = %v", err)
	}
	if len(prepared.ProxmoxVMs) != 0 {
		t.Fatalf("prepared VM deletes = %d, want 0", len(prepared.ProxmoxVMs))
	}
}

func TestPoolInDeletionHierarchy(t *testing.T) {
	tests := []struct {
		pool string
		root string
		want bool
	}{
		{pool: "pod_1", root: "pod_1", want: true},
		{pool: "pod_1/VMs", root: "pod_1", want: true},
		{pool: "pod_10", root: "pod_1", want: false},
		{pool: "", root: "pod_1", want: false},
	}
	for _, tt := range tests {
		if got := poolInDeletionHierarchy(tt.pool, tt.root); got != tt.want {
			t.Errorf("poolInDeletionHierarchy(%q, %q) = %t, want %t", tt.pool, tt.root, got, tt.want)
		}
	}
}
