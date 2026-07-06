package handlers

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
)

var errVMIDUnavailable = errors.New("vm id is already in use")

func isVMIDUnavailable(err error) bool { return errors.Is(err, errVMIDUnavailable) }

func runWithAvailableVMID(ctx context.Context, alloc *vmidalloc.Allocator, requestedID int, run func(vmid int) error) (int, error) {
	vmid, err := alloc.RunSingle(ctx, requestedID, run)
	if err != nil {
		if errors.Is(err, vmidalloc.ErrVMIDUnavailable) {
			return 0, errVMIDUnavailable
		}
		return 0, err
	}
	return vmid, nil
}
