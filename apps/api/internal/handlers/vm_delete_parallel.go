package handlers

import (
	"context"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
)

type boundedVMDeleteOutcome struct {
	target   vmactions.Target
	admitted bool
	claimed  bool
	err      error
}

func runBoundedVMDeletes(
	ctx context.Context,
	limit int,
	targets []vmactions.Target,
	acquireFn func(context.Context) (func(), error),
	deleteFn func(context.Context, vmactions.Target) (claimed bool, err error),
) []boundedVMDeleteOutcome {
	outcomes := make([]boundedVMDeleteOutcome, len(targets))
	if len(targets) == 0 {
		return outcomes
	}

	_ = runBoundedActions(ctx, limit, targets, func(ctx context.Context, index int, target vmactions.Target) error {
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
