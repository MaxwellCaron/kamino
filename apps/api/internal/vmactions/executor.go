package vmactions

import (
	"context"
	"errors"
	"time"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/google/uuid"
)

type PowerAction string

var ErrInvalidPowerAction = errors.New("invalid power action")

const (
	PowerActionStart    PowerAction = "start"
	PowerActionShutdown PowerAction = "shutdown"
	PowerActionReboot   PowerAction = "reboot"
	PowerActionStop     PowerAction = "stop"
)

type Target struct {
	ItemID uuid.UUID
	Node   string
	VMID   int
}

type Executor struct {
	px        *proxmox.Client
	inventory *inventory.Service
	notifier  *vmstatus.Notifier
}

func NewExecutor(
	px *proxmox.Client,
	inventoryService *inventory.Service,
	notifier *vmstatus.Notifier,
) *Executor {
	return &Executor{
		px:        px,
		inventory: inventoryService,
		notifier:  notifier,
	}
}

func (e *Executor) PowerAction(ctx context.Context, target Target, action PowerAction) error {
	switch action {
	case PowerActionStart:
		if err := e.px.StartVM(ctx, target.Node, target.VMID); err != nil {
			return err
		}
		go e.waitForObservedVMStatus(target.VMID, "running")
	case PowerActionShutdown:
		if err := e.px.ShutdownVM(ctx, target.Node, target.VMID); err != nil {
			return err
		}
		go e.waitForObservedVMStatus(target.VMID, "stopped")
	case PowerActionReboot:
		if err := e.px.RebootVM(ctx, target.Node, target.VMID); err != nil {
			return err
		}
		go e.waitForObservedVMStatus(target.VMID, "running")
	case PowerActionStop:
		if err := e.px.StopVM(ctx, target.Node, target.VMID); err != nil {
			return err
		}
		go e.waitForObservedVMStatus(target.VMID, "stopped")
	default:
		return ErrInvalidPowerAction
	}

	return nil
}

func (e *Executor) DeleteVM(ctx context.Context, target Target) error {
	if err := e.inventory.EnsureInventorySubtreeDeletable(ctx, target.ItemID); err != nil {
		return err
	}
	if err := e.px.DeleteVM(ctx, target.Node, target.VMID); err != nil {
		return err
	}
	if err := e.inventory.DeleteInventoryVM(ctx, target.ItemID); err != nil {
		return err
	}

	go e.waitForVMRemoval(target.VMID)
	return nil
}

func (e *Executor) CreateSnapshot(
	ctx context.Context,
	target Target,
	snapname string,
	description string,
	vmstate bool,
) error {
	return e.px.CreateSnapshot(ctx, target.Node, target.VMID, snapname, description, vmstate)
}

func (e *Executor) RollbackSnapshot(
	ctx context.Context,
	target Target,
	snapname string,
) error {
	return e.px.RollbackSnapshot(ctx, target.Node, target.VMID, snapname)
}

func (e *Executor) waitForObservedVMStatus(vmid int, expectedStatus string) {
	if e.notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	_ = e.notifier.RefreshUntilStatus(ctx, vmid, expectedStatus)
}

func (e *Executor) waitForVMRemoval(vmid int) {
	if e.notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	_ = e.notifier.RefreshUntilAbsent(ctx, vmid)
}
