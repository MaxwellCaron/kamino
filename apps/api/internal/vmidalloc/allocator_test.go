package vmidalloc

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
)

type fakeProvider struct {
	usedVMIDs      map[int]struct{}
	usedVMIDsErr   error
	usedVMIDsCalls int

	nextID    int
	nextErr   error
	available map[int]bool
	availErr  map[int]error
}

func (f *fakeProvider) UsedVMIDs(_ context.Context) (map[int]struct{}, error) {
	f.usedVMIDsCalls++
	if f.usedVMIDsErr != nil {
		return nil, f.usedVMIDsErr
	}
	out := make(map[int]struct{}, len(f.usedVMIDs))
	for id := range f.usedVMIDs {
		out[id] = struct{}{}
	}
	return out, nil
}

func (f *fakeProvider) GetNextVMID(_ context.Context) (int, error) {
	return f.nextID, f.nextErr
}

func (f *fakeProvider) IsVMIDAvailable(_ context.Context, vmid int) (bool, error) {
	if err, ok := f.availErr[vmid]; ok {
		return false, err
	}
	if avail, ok := f.available[vmid]; ok {
		return avail, nil
	}
	return true, nil
}

func TestNewBatch_SufficientCapacity(t *testing.T) {
	t.Parallel()

	px := &fakeProvider{usedVMIDs: map[int]struct{}{100: {}}}
	alloc := New(px)

	batch, err := alloc.NewBatch(context.Background(), Range{Min: 101, Max: 110}, 5)
	if err != nil {
		t.Fatalf("NewBatch returned error: %v", err)
	}
	if batch == nil {
		t.Fatal("NewBatch returned nil batch")
	}
}

func TestNewBatch_InsufficientCapacity(t *testing.T) {
	t.Parallel()

	px := &fakeProvider{
		usedVMIDs: map[int]struct{}{
			100: {},
			101: {},
			102: {},
		},
	}
	alloc := New(px)

	_, err := alloc.NewBatch(context.Background(), Range{Min: 100, Max: 102}, 2)
	if !IsRangeExhausted(err) {
		t.Fatalf("NewBatch error = %v, want range exhausted", err)
	}
	if px.usedVMIDsCalls != 1 {
		t.Fatalf("UsedVMIDs calls = %d, want 1 (no side effects beyond snapshot load)", px.usedVMIDsCalls)
	}
}

func TestBatchClaim_ConcurrentUnique(t *testing.T) {
	t.Parallel()

	const n = 32
	px := &fakeProvider{usedVMIDs: map[int]struct{}{}}
	alloc := New(px)

	batch, err := alloc.NewBatch(context.Background(), Range{Min: 100, Max: 100 + n - 1}, n)
	if err != nil {
		t.Fatalf("NewBatch returned error: %v", err)
	}

	var (
		mu      sync.Mutex
		claimed []int
		wg      sync.WaitGroup
		errs    []error
	)
	wg.Add(n)
	for range n {
		go func() {
			defer wg.Done()
			vmid, claimErr := batch.Claim(context.Background(), func(id int) error {
				mu.Lock()
				claimed = append(claimed, id)
				mu.Unlock()
				return nil
			})
			if claimErr != nil {
				mu.Lock()
				errs = append(errs, claimErr)
				mu.Unlock()
				return
			}
			if vmid < 100 || vmid > 100+n-1 {
				mu.Lock()
				errs = append(errs, fmt.Errorf("vmid %d out of range", vmid))
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if len(errs) > 0 {
		t.Fatalf("Claim errors: %v", errs)
	}
	if len(claimed) != n {
		t.Fatalf("claimed %d VMIDs, want %d", len(claimed), n)
	}
	seen := make(map[int]struct{}, len(claimed))
	for _, id := range claimed {
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate VMID claimed: %d", id)
		}
		seen[id] = struct{}{}
	}

	_, err = batch.Claim(context.Background(), func(int) error { return nil })
	if !IsRangeExhausted(err) {
		t.Fatalf("extra Claim error = %v, want range exhausted", err)
	}
}

func TestBatchClaim_ConflictAdvances(t *testing.T) {
	t.Parallel()

	px := &fakeProvider{usedVMIDs: map[int]struct{}{}}
	alloc := New(px)

	batch, err := alloc.NewBatch(context.Background(), Range{Min: 200, Max: 205}, 1)
	if err != nil {
		t.Fatalf("NewBatch returned error: %v", err)
	}

	conflictErr := errors.New("unable to create VM 200 - vmid already exists")
	vmid, err := batch.Claim(context.Background(), func(id int) error {
		if id == 200 {
			return conflictErr
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Claim returned error: %v", err)
	}
	if vmid != 201 {
		t.Fatalf("Claim vmid = %d, want 201", vmid)
	}

	_, err = batch.Claim(context.Background(), func(id int) error {
		if id == 200 {
			t.Fatal("conflicted VMID 200 was offered again")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("second Claim returned error: %v", err)
	}
}

func TestBatchClaim_NonConflictErrorPropagates(t *testing.T) {
	t.Parallel()

	px := &fakeProvider{usedVMIDs: map[int]struct{}{}}
	alloc := New(px)

	batch, err := alloc.NewBatch(context.Background(), Range{Min: 300, Max: 305}, 1)
	if err != nil {
		t.Fatalf("NewBatch returned error: %v", err)
	}

	wantErr := errors.New("proxmox unreachable")
	_, err = batch.Claim(context.Background(), func(int) error {
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("Claim error = %v, want %v", err, wantErr)
	}

	vmid, err := batch.Claim(context.Background(), func(int) error { return nil })
	if err != nil {
		t.Fatalf("retry Claim returned error: %v", err)
	}
	if vmid != 300 {
		t.Fatalf("retry Claim vmid = %d, want 300 (candidate not marked used)", vmid)
	}
}
