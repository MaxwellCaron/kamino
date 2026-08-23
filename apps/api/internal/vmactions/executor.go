package vmactions

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/google/uuid"
	"golang.org/x/sync/semaphore"
)

type PowerAction string

var ErrInvalidPowerAction = errors.New("invalid power action")

const (
	PowerActionStart    PowerAction = "start"
	PowerActionShutdown PowerAction = "shutdown"
	PowerActionReboot   PowerAction = "reboot"
	PowerActionStop     PowerAction = "stop"
)

type OperationConfig struct {
	Concurrency int
}

type PowerConfig struct {
	Concurrency int
	TaskTimeout time.Duration
}

type Target struct {
	ItemID    uuid.UUID
	Node      string
	VMID      int
	GuestType proxmox.GuestType
}

type Executor struct {
	px               *proxmox.Client
	inventory        *inventory.Service
	notifier         *vmstatus.Notifier
	operationConfig  OperationConfig
	operationLimiter *semaphore.Weighted
	powerConfig      PowerConfig
	powerLimiter     *semaphore.Weighted
}

func NewExecutor(
	px *proxmox.Client,
	inventoryService *inventory.Service,
	notifier *vmstatus.Notifier,
	operationConfig OperationConfig,
	powerConfig PowerConfig,
) *Executor {
	return &Executor{
		px:               px,
		inventory:        inventoryService,
		notifier:         notifier,
		operationConfig:  operationConfig,
		operationLimiter: semaphore.NewWeighted(int64(operationConfig.Concurrency)),
		powerConfig:      powerConfig,
		powerLimiter:     semaphore.NewWeighted(int64(powerConfig.Concurrency)),
	}
}

func (e *Executor) OperationConcurrency() int {
	return e.operationConfig.Concurrency
}

func (e *Executor) AcquireOperationSlot(ctx context.Context) (release func(), err error) {
	if err := e.operationLimiter.Acquire(ctx, 1); err != nil {
		return nil, err
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			e.operationLimiter.Release(1)
		})
	}, nil
}

func (e *Executor) PowerConcurrency() int {
	return e.powerConfig.Concurrency
}

func (e *Executor) PowerAction(ctx context.Context, target Target, action PowerAction) error {
	switch action {
	case PowerActionStart, PowerActionShutdown, PowerActionReboot, PowerActionStop:
	default:
		return ErrInvalidPowerAction
	}

	if err := e.powerLimiter.Acquire(ctx, 1); err != nil {
		return err
	}
	defer e.powerLimiter.Release(1)

	taskCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), e.powerConfig.TaskTimeout)
	defer cancel()

	task, err := e.startPowerTask(taskCtx, target, action)
	if err != nil {
		return err
	}
	if err := e.px.WaitForTask(taskCtx, task.Node, task.UPID); err != nil {
		return err
	}

	switch action {
	case PowerActionStart, PowerActionReboot:
		go e.waitForObservedVMStatus(target.VMID, "running")
	case PowerActionShutdown, PowerActionStop:
		go e.waitForObservedVMStatus(target.VMID, "stopped")
	}

	return nil
}

func (e *Executor) startPowerTask(
	ctx context.Context,
	target Target,
	action PowerAction,
) (proxmox.Task, error) {
	switch action {
	case PowerActionStart:
		return e.px.StartVMTask(ctx, target.GuestType, target.Node, target.VMID)
	case PowerActionShutdown:
		return e.px.ShutdownVMTask(ctx, target.GuestType, target.Node, target.VMID)
	case PowerActionReboot:
		return e.px.RebootVMTask(ctx, target.GuestType, target.Node, target.VMID)
	case PowerActionStop:
		return e.px.StopVMTask(ctx, target.GuestType, target.Node, target.VMID)
	default:
		return proxmox.Task{}, ErrInvalidPowerAction
	}
}

func (e *Executor) DeleteVM(ctx context.Context, target Target) error {
	if err := e.inventory.EnsureInventorySubtreeDeletable(ctx, target.ItemID); err != nil {
		return err
	}
	if err := e.px.DeleteVMStopped(ctx, target.GuestType, target.Node, target.VMID); err != nil {
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
	return e.px.CreateSnapshot(ctx, target.GuestType, target.Node, target.VMID, snapname, description, vmstate)
}

func (e *Executor) RollbackSnapshot(
	ctx context.Context,
	target Target,
	snapname string,
) error {
	return e.px.RollbackSnapshot(ctx, target.GuestType, target.Node, target.VMID, snapname)
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
