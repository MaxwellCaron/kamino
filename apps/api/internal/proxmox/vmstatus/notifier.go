package vmstatus

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

const pollInterval = 10 * time.Second
const catchUpPollInterval = 1 * time.Second

type Event struct {
	Type      string         `json:"type"`
	Statuses  map[int]string `json:"statuses"`
	Timestamp time.Time      `json:"timestamp"`
}

type Notifier struct {
	px *proxmox.Client

	pollMu      sync.Mutex
	mu          sync.RWMutex
	subscribers map[chan Event]struct{}
	last        map[int]string
}

func NewNotifier(px *proxmox.Client) *Notifier {
	return &Notifier{
		px:          px,
		subscribers: make(map[chan Event]struct{}),
		last:        make(map[int]string),
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
	n.pollMu.Lock()
	defer n.pollMu.Unlock()

	return n.pollAndBroadcast(ctx)
}

func (n *Notifier) RefreshUntilStatus(
	ctx context.Context,
	vmid int,
	expectedStatus string,
) error {
	return n.refreshUntil(ctx, func(statuses map[int]string) bool {
		return statuses[vmid] == expectedStatus
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
		if err := n.RefreshNow(ctx); err != nil {
			return err
		}

		if matches(n.Current()) {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (n *Notifier) pollAndBroadcast(ctx context.Context) error {
	vms, err := n.px.GetVMs(ctx)
	if err != nil {
		return err
	}

	next := make(map[int]string, len(vms))
	for _, vm := range vms {
		next[vm.VMID] = vm.Status
	}

	n.mu.Lock()
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
