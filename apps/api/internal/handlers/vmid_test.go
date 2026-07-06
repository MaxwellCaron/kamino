package handlers

import (
	"context"
	"errors"
	"slices"
	"testing"
)

type stubVMIDAllocator struct {
	nextID          int
	nextErr         error
	availableResult map[int]bool
	availableErr    map[int]error
	runErrs         map[int]error
	runCalls        []int
}

func (s *stubVMIDAllocator) GetNextVMID(ctx context.Context) (int, error) {
	return s.nextID, s.nextErr
}

func (s *stubVMIDAllocator) IsVMIDAvailable(ctx context.Context, vmid int) (bool, error) {
	if err, ok := s.availableErr[vmid]; ok {
		return false, err
	}
	avail, ok := s.availableResult[vmid]
	if !ok {
		return true, nil
	}
	return avail, nil
}

func (s *stubVMIDAllocator) run(vmid int) error {
	s.runCalls = append(s.runCalls, vmid)
	return s.runErrs[vmid]
}

func TestRunWithAvailableVMIDSkipsUnavailableCandidatesAndRetriesConflict(t *testing.T) {
	t.Parallel()

	allocator := &stubVMIDAllocator{
		nextID: 100,
		availableResult: map[int]bool{
			100: false,
			101: false,
		},
		runErrs: map[int]error{
			102: errors.New("unable to create VM 102 - vmid already exists"),
		},
	}

	vmid, err := runWithAvailableVMID(context.Background(), allocator, 0, allocator.run)
	if err != nil {
		t.Fatalf("runWithAvailableVMID returned error: %v", err)
	}
	if vmid != 103 {
		t.Fatalf("runWithAvailableVMID vmid = %d, want 103", vmid)
	}

	wantCalls := []int{102, 103}
	if !slices.Equal(allocator.runCalls, wantCalls) {
		t.Fatalf("run calls = %v, want %v", allocator.runCalls, wantCalls)
	}
}

func TestRunWithAvailableVMIDReturnsConflictForUnavailableRequestedID(t *testing.T) {
	t.Parallel()

	allocator := &stubVMIDAllocator{
		availableResult: map[int]bool{200: false},
	}

	_, err := runWithAvailableVMID(context.Background(), allocator, 200, allocator.run)
	if !isVMIDUnavailable(err) {
		t.Fatalf("runWithAvailableVMID error = %v, want vmid unavailable", err)
	}
	if len(allocator.runCalls) != 0 {
		t.Fatalf("run calls = %v, want no calls", allocator.runCalls)
	}
}

func TestRunWithAvailableVMIDAvailabilityErrorStopsAllocation(t *testing.T) {
	t.Parallel()

	availErr := errors.New("proxmox node unreachable")
	allocator := &stubVMIDAllocator{
		nextID:       100,
		availableErr: map[int]error{100: availErr},
	}

	_, err := runWithAvailableVMID(context.Background(), allocator, 0, allocator.run)
	if err == nil {
		t.Fatal("runWithAvailableVMID returned nil error, want availability error")
	}
	if len(allocator.runCalls) != 0 {
		t.Fatalf("run calls = %v, want no calls on availability error", allocator.runCalls)
	}
}
