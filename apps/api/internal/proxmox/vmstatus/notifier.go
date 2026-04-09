package vmstatus

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

const pollInterval = 10 * time.Second

type Event struct {
	Type      string         `json:"type"`
	Statuses  map[int]string `json:"statuses"`
	Timestamp time.Time      `json:"timestamp"`
}

type Notifier struct {
	px *proxmox.Client

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
	n.pollAndBroadcast(ctx)

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n.pollAndBroadcast(ctx)
		}
	}
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

func (n *Notifier) pollAndBroadcast(ctx context.Context) {
	vms, err := n.px.GetVMs(ctx)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("vm status notifier poll failed: %v", err)
		}
		return
	}

	next := make(map[int]string, len(vms))
	for _, vm := range vms {
		next[vm.VMID] = vm.Status
	}

	n.mu.Lock()
	if statusesEqual(n.last, next) {
		n.mu.Unlock()
		return
	}

	n.last = next
	event := Event{
		Type:      "vm.statuses.changed",
		Statuses:  cloneStatuses(next),
		Timestamp: time.Now().UTC(),
	}
	n.mu.Unlock()

	n.broadcast(event)
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
