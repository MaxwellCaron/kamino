package vmstatus

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"golang.org/x/sync/singleflight"
)

const pollInterval = 10 * time.Second
const catchUpPollInterval = 1 * time.Second
const refreshPollTimeout = 30 * time.Second

type Event struct {
	Type      string         `json:"type"`
	Statuses  map[int]string `json:"statuses"`
	Timestamp time.Time      `json:"timestamp"`
}

// VMResources holds live resource metrics for a single VM.
type VMResources struct {
	CPU       float64 `json:"cpu"`
	MaxCPU    int     `json:"maxcpu"`
	Mem       int64   `json:"mem"`
	MaxMem    int64   `json:"maxmem"`
	Disk      int64   `json:"disk"`
	MaxDisk   int64   `json:"maxdisk"`
	NetIn     int64   `json:"netin"`
	NetOut    int64   `json:"netout"`
	DiskRead  int64   `json:"diskread"`
	DiskWrite int64   `json:"diskwrite"`
	Uptime    int64   `json:"uptime"`
}

type Notifier struct {
	px *proxmox.Client

	refreshGroup singleflight.Group
	mu           sync.RWMutex
	subscribers  map[chan Event]struct{}
	last         map[int]string
	resources    map[int]VMResources
}

func NewNotifier(px *proxmox.Client) *Notifier {
	return &Notifier{
		px:          px,
		subscribers: make(map[chan Event]struct{}),
		last:        make(map[int]string),
		resources:   make(map[int]VMResources),
	}
}

func (n *Notifier) Start(ctx context.Context) {
	if err := n.RefreshNow(ctx); err != nil && ctx.Err() == nil {
		log.Printf("vm status notifier initial poll failed: %v", err)
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := n.RefreshNow(ctx); err != nil && ctx.Err() == nil {
				log.Printf("vm status notifier poll failed: %v", err)
			}
		}
	}
}

func (n *Notifier) RefreshNow(ctx context.Context) error {
	result := n.refreshGroup.DoChan("refresh", func() (any, error) {
		pollCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), refreshPollTimeout)
		defer cancel()
		return nil, n.pollAndBroadcast(pollCtx)
	})

	select {
	case res := <-result:
		return res.Err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (n *Notifier) RefreshUntilStatus(
	ctx context.Context,
	vmid int,
	expectedStatus string,
) error {
	return n.RefreshUntilStatuses(ctx, map[int]string{vmid: expectedStatus})
}

func (n *Notifier) RefreshUntilStatuses(
	ctx context.Context,
	expected map[int]string,
) error {
	return n.refreshUntil(ctx, func(statuses map[int]string) bool {
		for vmid, want := range expected {
			if statuses[vmid] != want {
				return false
			}
		}
		return true
	})
}

func (n *Notifier) RefreshUntilAbsent(ctx context.Context, vmid int) error {
	return n.refreshUntil(ctx, func(statuses map[int]string) bool {
		_, exists := statuses[vmid]
		return !exists
	})
}

func (n *Notifier) Current() map[int]string {
	n.mu.RLock()
	defer n.mu.RUnlock()

	return cloneStatuses(n.last)
}

func (n *Notifier) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 16)

	n.mu.Lock()
	n.subscribers[ch] = struct{}{}
	n.mu.Unlock()

	return ch, func() {
		n.mu.Lock()
		if _, ok := n.subscribers[ch]; ok {
			delete(n.subscribers, ch)
			close(ch)
		}
		n.mu.Unlock()
	}
}

func (n *Notifier) refreshUntil(
	ctx context.Context,
	matches func(statuses map[int]string) bool,
) error {
	if matches(n.Current()) {
		return nil
	}

	ticker := time.NewTicker(catchUpPollInterval)
	defer ticker.Stop()

	for {
		if err := n.RefreshNow(ctx); err == nil && matches(n.Current()) {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

// Resources returns the cached resource metrics for a single VM.
func (n *Notifier) Resources(vmid int) (VMResources, bool) {
	n.mu.RLock()
	defer n.mu.RUnlock()

	res, ok := n.resources[vmid]
	return res, ok
}

func (n *Notifier) pollAndBroadcast(ctx context.Context) error {
	vms, err := n.px.GetVMs(ctx)
	if err != nil {
		return err
	}

	next := make(map[int]string, len(vms))
	nextResources := make(map[int]VMResources, len(vms))
	for _, vm := range vms {
		next[vm.VMID] = vm.Status
		nextResources[vm.VMID] = VMResources{
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

	n.mu.Lock()
	n.resources = nextResources

	if statusesEqual(n.last, next) {
		n.mu.Unlock()
		return nil
	}

	n.last = next
	event := Event{
		Type:      "vm.statuses.changed",
		Statuses:  cloneStatuses(next),
		Timestamp: time.Now().UTC(),
	}
	n.mu.Unlock()

	n.broadcast(event)
	return nil
}

func (n *Notifier) broadcast(event Event) {
	n.mu.RLock()
	defer n.mu.RUnlock()

	for ch := range n.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

func cloneStatuses(statuses map[int]string) map[int]string {
	cloned := make(map[int]string, len(statuses))
	for vmid, status := range statuses {
		cloned[vmid] = status
	}
	return cloned
}

func statusesEqual(left, right map[int]string) bool {
	if len(left) != len(right) {
		return false
	}

	for vmid, status := range left {
		if right[vmid] != status {
			return false
		}
	}

	return true
}
