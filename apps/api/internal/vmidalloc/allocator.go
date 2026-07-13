package vmidalloc

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

// Range is an inclusive [Min, Max] VMID window.
type Range struct {
	Min int
	Max int
}

// ErrVMIDUnavailable is returned by RunSingle when the requested VMID is occupied or conflicted.
var ErrVMIDUnavailable = errors.New("vmid is already in use")

// ErrRangeExhausted is returned when no free candidate remains in a range.
type ErrRangeExhausted struct {
	Min, Max int
}

func (e *ErrRangeExhausted) Error() string {
	return fmt.Sprintf("no available VMID in range %d–%d", e.Min, e.Max)
}

// IsRangeExhausted reports whether err is an *ErrRangeExhausted.
func IsRangeExhausted(err error) bool {
	var t *ErrRangeExhausted
	return errors.As(err, &t)
}

type proxmoxProvider interface {
	UsedVMIDs(ctx context.Context) (map[int]struct{}, error)
	GetNextVMID(ctx context.Context) (int, error)
	IsVMIDAvailable(ctx context.Context, vmid int) (bool, error)
}

// singleAllocAttempts bounds the scan window for ordinary (non-batch) allocation.
const singleAllocAttempts = 25

// Allocator is the single process-wide VMID coordinator. One instance is constructed
// at startup and shared across all handlers; no handler may create its own mutex.
type Allocator struct {
	px       proxmoxProvider
	mu       sync.Mutex
	inflight map[int]struct{} // VMIDs claimed by unreleased batches; guarded by mu
}

func New(px proxmoxProvider) *Allocator {
	return &Allocator{px: px, inflight: make(map[int]struct{})}
}

// NewBatch loads the cluster VMID set once and returns a Batch for r.
// Returns *ErrRangeExhausted before any side effect when capacity is insufficient.
func (a *Allocator) NewBatch(ctx context.Context, r Range, requiredCount int) (*Batch, error) {
	used, err := a.px.UsedVMIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("load cluster VMID snapshot: %w", err)
	}
	a.mu.Lock()
	for id := range a.inflight {
		used[id] = struct{}{}
	}
	a.mu.Unlock()
	free := 0
	for id := r.Min; id <= r.Max; id++ {
		if _, occupied := used[id]; !occupied {
			free++
			if free >= requiredCount {
				break
			}
		}
	}
	if free < requiredCount {
		return nil, &ErrRangeExhausted{Min: r.Min, Max: r.Max}
	}
	return &Batch{alloc: a, r: r, used: used, cursor: r.Min}, nil
}

// RunSingle allocates one VMID using the same process-wide mutex as batch operations.
// requestedID > 0 validates first; 0 starts from Proxmox nextid.
func (a *Allocator) RunSingle(
	ctx context.Context,
	requestedID int,
	run func(vmid int) error,
) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if requestedID > 0 {
		if _, occupied := a.inflight[requestedID]; occupied {
			return 0, ErrVMIDUnavailable
		}
		available, err := a.px.IsVMIDAvailable(ctx, requestedID)
		if err != nil {
			return 0, fmt.Errorf("verify VMID %d availability: %w", requestedID, err)
		}
		if !available {
			return 0, ErrVMIDUnavailable
		}
		if err := run(requestedID); err != nil {
			if proxmox.IsVMIDCreateConflict(err) {
				return 0, ErrVMIDUnavailable
			}
			return 0, err
		}
		return requestedID, nil
	}

	firstID, err := a.px.GetNextVMID(ctx)
	if err != nil {
		return 0, fmt.Errorf("fetch next VMID: %w", err)
	}
	var lastErr error
	for offset := range singleAllocAttempts {
		vmid := firstID + offset
		if _, occupied := a.inflight[vmid]; occupied {
			continue
		}
		available, err := a.px.IsVMIDAvailable(ctx, vmid)
		if err != nil {
			return 0, fmt.Errorf("verify VMID %d availability: %w", vmid, err)
		}
		if !available {
			continue
		}
		if err := run(vmid); err != nil {
			lastErr = err
			if proxmox.IsVMIDCreateConflict(err) {
				continue
			}
			return 0, err
		}
		return vmid, nil
	}
	if lastErr != nil {
		return 0, fmt.Errorf("allocate VMID from %d to %d: %w", firstID, firstID+singleAllocAttempts-1, lastErr)
	}
	return 0, fmt.Errorf("no available VMID found from %d to %d", firstID, firstID+singleAllocAttempts-1)
}

// Batch holds a snapshot for one bulk allocation; safe for concurrent Claim calls.
type Batch struct {
	alloc   *Allocator
	r       Range
	used    map[int]struct{}
	cursor  int
	claimed []int
}

// Claim holds the allocator mutex while selecting and starting one clone.
// Create conflicts advance to the next candidate; other errors return immediately.
func (b *Batch) Claim(ctx context.Context, claim func(vmid int) error) (int, error) {
	b.alloc.mu.Lock()
	defer b.alloc.mu.Unlock()

	for id := b.cursor; id <= b.r.Max; id++ {
		if _, occupied := b.used[id]; occupied {
			continue
		}
		if _, occupied := b.alloc.inflight[id]; occupied {
			continue
		}
		if err := claim(id); err != nil {
			if proxmox.IsVMIDCreateConflict(err) {
				b.used[id] = struct{}{}
				continue
			}
			return 0, err
		}
		b.used[id] = struct{}{}
		b.alloc.inflight[id] = struct{}{}
		b.claimed = append(b.claimed, id)
		b.cursor = id + 1
		return id, nil
	}
	return 0, &ErrRangeExhausted{Min: b.r.Min, Max: b.r.Max}
}

// Release frees this batch's process-wide VMID reservations. Callers must
// invoke it only after every claimed clone task has completed or its VM has
// been cleaned up — from that point Proxmox itself reports the VMID state.
func (b *Batch) Release() {
	if b == nil {
		return
	}
	b.alloc.mu.Lock()
	defer b.alloc.mu.Unlock()
	for _, id := range b.claimed {
		delete(b.alloc.inflight, id)
	}
	b.claimed = nil
}
