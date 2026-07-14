package handlers

import (
	"context"
	"errors"
	"net/http"

	"golang.org/x/sync/errgroup"
)

func runCreatePodClones(
	ctx context.Context,
	limit int,
	specs []podCloneSpec,
	cloneFn func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *requestError),
) ([]createPodVMResult, *requestError) {
	if len(specs) == 0 {
		return nil, nil
	}

	results := make([]createPodVMResult, len(specs))
	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(limit)

	for i, spec := range specs {
		i, spec := i, spec
		group.Go(func() error {
			result, reqErr := cloneFn(gctx, i, spec)
			if reqErr != nil {
				return reqErr
			}
			results[i] = result
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return nil, reqErr
		}
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone pod templates",
			Operation:   "clone pod templates concurrently",
			Err:         err,
		}
	}

	return results, nil
}
