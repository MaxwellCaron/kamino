package vmidalloc

import (
	"context"
	"errors"
	"slices"
	"testing"
)

// stubAllocProvider implements vmidalloc's proxmoxProvider interface for tests.
type stubAllocProvider struct {
	nextID          int
	nextErr         error
	availableResult map[int]bool
	availableErr    map[int]error
	usedVMIDs       map[int]struct{}
	reservedVMIDs   []int32
	runErrs         map[int]error
	runCalls        []int
}

func newTestAllocator(px *stubAllocProvider) *Allocator {
	return New(px, px)
}

func TestRunSingleSkipsUnavailableCandidatesAndRetriesConflict(t *testing.T) {
	t.Parallel()

	px := &stubAllocProvider{
		nextID: 100,
		availableResult: map[int]bool{
			100: false,
			101: false,
		},
		runErrs: map[int]error{
			102: errors.New("unable to create VM 102 - vmid already exists"),
		},
	}
	alloc := newTestAllocator(px)

	vmid, err := alloc.RunSingle(context.Background(), 0, px.run)
	if err != nil {
		t.Fatalf("RunSingle returned error: %v", err)
	}
	if vmid != 103 {
		t.Fatalf("RunSingle vmid = %d, want 103", vmid)
	}

	wantCalls := []int{102, 103}
	if !slices.Equal(px.runCalls, wantCalls) {
		t.Fatalf("run calls = %v, want %v", px.runCalls, wantCalls)
	}
}

func TestRunSingleReturnsConflictForUnavailableRequestedID(t *testing.T) {
	t.Parallel()

	px := &stubAllocProvider{
		availableResult: map[int]bool{200: false},
	}
	alloc := newTestAllocator(px)

	_, err := alloc.RunSingle(context.Background(), 200, px.run)
	if !errors.Is(err, ErrVMIDUnavailable) {
		t.Fatalf("RunSingle error = %v, want vmid unavailable", err)
	}
	if len(px.runCalls) != 0 {
		t.Fatalf("run calls = %v, want no calls", px.runCalls)
	}
}

func TestRunSingleAvailabilityErrorStopsAllocation(t *testing.T) {
	t.Parallel()

	availErr := errors.New("proxmox node unreachable")
	px := &stubAllocProvider{
		nextID:       100,
		availableErr: map[int]error{100: availErr},
	}
	alloc := newTestAllocator(px)

	_, err := alloc.RunSingle(context.Background(), 0, px.run)
	if err == nil {
		t.Fatal("RunSingle returned nil error, want availability error")
	}
	if len(px.runCalls) != 0 {
		t.Fatalf("run calls = %v, want no calls on availability error", px.runCalls)
	}
}

func (s *stubAllocProvider) UsedVMIDs(_ context.Context) (map[int]struct{}, error) {
	out := make(map[int]struct{}, len(s.usedVMIDs))
	for k := range s.usedVMIDs {
		out[k] = struct{}{}
	}
	return out, nil
}

func (s *stubAllocProvider) GetNextVMID(_ context.Context) (int, error) {
	return s.nextID, s.nextErr
}

func (s *stubAllocProvider) IsVMIDAvailable(_ context.Context, vmid int) (bool, error) {
	if err, ok := s.availableErr[vmid]; ok {
		return false, err
	}
	if avail, ok := s.availableResult[vmid]; ok {
		return avail, nil
	}
	return true, nil
}

func (s *stubAllocProvider) ListReservedProxmoxVMIDs(_ context.Context) ([]int32, error) {
	return append([]int32(nil), s.reservedVMIDs...), nil
}

func (s *stubAllocProvider) run(vmid int) error {
	s.runCalls = append(s.runCalls, vmid)
	return s.runErrs[vmid]
}
