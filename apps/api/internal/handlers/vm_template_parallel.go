package handlers

import (
	"context"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

type boundedVMTemplateOutcome struct {
	target              verifiedVMTarget
	unsupported         bool
	admitted            bool
	claimed             bool
	err                 error
	inventorySyncFailed bool
}

func runBoundedVMTemplateConversions(
	ctx context.Context,
	limit int,
	targets []verifiedVMTarget,
	acquireFn func(context.Context) (func(), error),
	convertFn func(context.Context, verifiedVMTarget) (claimed bool, inventorySyncFailed bool, err error),
) []boundedVMTemplateOutcome {
	outcomes := make([]boundedVMTemplateOutcome, len(targets))
	if len(targets) == 0 {
		return outcomes
	}

	_ = runBoundedActions(ctx, limit, targets, func(ctx context.Context, index int, target verifiedVMTarget) error {
		outcomes[index].target = target
		if target.GuestType == proxmox.GuestLXC {
			outcomes[index].unsupported = true
			return nil
		}

		release, err := acquireFn(ctx)
		if err != nil {
			outcomes[index].err = err
			return nil
		}
		defer release()
		outcomes[index].admitted = true

		claimed, inventorySyncFailed, convertErr := convertFn(ctx, target)
		outcomes[index].claimed = claimed
		outcomes[index].inventorySyncFailed = inventorySyncFailed
		outcomes[index].err = convertErr
		return nil
	})

	return outcomes
}
