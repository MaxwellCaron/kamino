package handlers

import (
	"context"
	"errors"
	"slices"
	"testing"
)

type stubVMIDAllocator struct {
	nextID       int
	nextErr      error
	usedVMIDs    map[int]struct{}
	usedErr      error
	configExists map[int]bool
	configErrs   map[int]error
	runErrs      map[int]error
	runCalls     []int
}

func (s *stubVMIDAllocator) GetNextVMID(ctx context.Context) (int, error) {
	return s.nextID, s.nextErr
}

func (s *stubVMIDAllocator) UsedVMIDs(ctx context.Context) (map[int]struct{}, error) {
	if s.usedErr != nil {
		return nil, s.usedErr
	}

	used := make(map[int]struct{}, len(s.usedVMIDs))
	for vmid := range s.usedVMIDs {
		used[vmid] = struct{}{}
	}
	return used, nil
}

func (s *stubVMIDAllocator) QEMUConfigExistsForVMID(ctx context.Context, vmid int) (bool, error) {
	if err, ok := s.configErrs[vmid]; ok {
		return false, err
	}
	return s.configExists[vmid], nil
}

func (s *stubVMIDAllocator) run(vmid int) error {
	s.runCalls = append(s.runCalls, vmid)
	return s.runErrs[vmid]
}

func TestRunWithAvailableVMIDSkipsUnavailableCandidatesAndRetriesConflict(t *testing.T) {
	t.Parallel()

	allocator := &stubVMIDAllocator{
		nextID:       100,
		usedVMIDs:    map[int]struct{}{100: {}},
		configExists: map[int]bool{101: true},
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
		usedVMIDs: map[int]struct{}{200: {}},
	}

	_, err := runWithAvailableVMID(context.Background(), allocator, 200, allocator.run)
	if !isVMIDUnavailable(err) {
		t.Fatalf("runWithAvailableVMID error = %v, want vmid unavailable", err)
	}
	if len(allocator.runCalls) != 0 {
		t.Fatalf("run calls = %v, want no calls", allocator.runCalls)
	}
}
