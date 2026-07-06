package handlers

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

var errVMIDUnavailable = errors.New("vm id is already in use")

type vmidAllocator interface {
	GetNextVMID(ctx context.Context) (int, error)
	IsVMIDAvailable(ctx context.Context, vmid int) (bool, error)
}

func isVMIDUnavailable(err error) bool {
	return errors.Is(err, errVMIDUnavailable)
}

func runWithAvailableVMID(
	ctx context.Context,
	px vmidAllocator,
	requestedID int,
	run func(vmid int) error,
) (int, error) {
	if requestedID > 0 {
		if err := ensureVMIDAvailable(ctx, px, requestedID); err != nil {
			return 0, err
		}

		if err := run(requestedID); err != nil {
			if proxmox.IsVMIDCreateConflict(err) {
				return 0, errVMIDUnavailable
			}
			return 0, err
		}

		return requestedID, nil
	}

	firstID, err := px.GetNextVMID(ctx)
	if err != nil {
		return 0, fmt.Errorf("fetch next VMID: %w", err)
	}

	var lastErr error
	for offset := range cloneVMIDAllocationAttempts {
		vmid := firstID + offset
		available, err := px.IsVMIDAvailable(ctx, vmid)
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
		return 0, fmt.Errorf(
			"allocate VMID from %d to %d: %w",
			firstID,
			firstID+cloneVMIDAllocationAttempts-1,
			lastErr,
		)
	}

	return 0, fmt.Errorf(
		"no available VMID found from %d to %d",
		firstID,
		firstID+cloneVMIDAllocationAttempts-1,
	)
}

func ensureVMIDAvailable(ctx context.Context, px vmidAllocator, vmid int) error {
	available, err := px.IsVMIDAvailable(ctx, vmid)
	if err != nil {
		return fmt.Errorf("verify VMID %d availability: %w", vmid, err)
	}
	if !available {
		return errVMIDUnavailable
	}
	return nil
}
