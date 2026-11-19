package pods

import (
	"context"
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"golang.org/x/sync/errgroup"
)

func runCreatePodClones(
	ctx context.Context,
	limit int,
	specs []podCloneSpec,
	cloneFn func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *httpx.RequestError),
) ([]createPodVMResult, *httpx.RequestError) {
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
		var reqErr *httpx.RequestError
		if errors.As(err, &reqErr) {
			return nil, reqErr
		}
		return nil, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone pod templates",
			Operation:   "clone pod templates concurrently",
			Err:         err,
		}
	}

	return results, nil
}
