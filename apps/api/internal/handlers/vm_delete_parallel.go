package handlers

import (
	"context"
)

type boundedVMDeleteOutcome struct {
	target   verifiedVMTarget
	admitted bool
	claimed  bool
	err      error
}

func runBoundedVMDeletes(
	ctx context.Context,
	limit int,
	targets []verifiedVMTarget,
	acquireFn func(context.Context) (func(), error),
	deleteFn func(context.Context, verifiedVMTarget) (claimed bool, err error),
) []boundedVMDeleteOutcome {
	outcomes := make([]boundedVMDeleteOutcome, len(targets))
	if len(targets) == 0 {
		return outcomes
	}

	_ = runBoundedActions(ctx, limit, targets, func(ctx context.Context, index int, target verifiedVMTarget) error {
		outcomes[index].target = target

		release, err := acquireFn(ctx)
		if err != nil {
			outcomes[index].err = err
			return nil
		}
		defer release()
		outcomes[index].admitted = true

		claimed, deleteErr := deleteFn(ctx, target)
		outcomes[index].claimed = claimed
		outcomes[index].err = deleteErr
		return nil
	})

	return outcomes
}
