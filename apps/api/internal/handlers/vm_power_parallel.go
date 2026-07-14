package handlers

import (
	"context"

	"golang.org/x/sync/errgroup"
)

type boundedPowerActionResult struct {
	Index int
	Err   error
}

func runBoundedPowerActions[T any](
	ctx context.Context,
	limit int,
	targets []T,
	fn func(ctx context.Context, index int, target T) error,
) []boundedPowerActionResult {
	results := make([]boundedPowerActionResult, len(targets))
	if len(targets) == 0 {
		return results
	}

	group := new(errgroup.Group)
	if limit > 0 {
		group.SetLimit(limit)
	}

	for index, target := range targets {
		index, target := index, target
		group.Go(func() error {
			results[index] = boundedPowerActionResult{
				Index: index,
				Err:   fn(ctx, index, target),
			}
			return nil
		})
	}

	_ = group.Wait()
	return results
}
