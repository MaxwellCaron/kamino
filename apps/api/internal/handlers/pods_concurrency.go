package handlers

import (
	"context"

	"golang.org/x/sync/semaphore"
)

type PodProvisionLimiter struct {
	limit int
	sem   *semaphore.Weighted
}

func NewPodProvisionLimiter(limit int) *PodProvisionLimiter {
	return &PodProvisionLimiter{
		limit: limit,
		sem:   semaphore.NewWeighted(int64(limit)),
	}
}

func (l *PodProvisionLimiter) Limit() int {
	return l.limit
}

func (h *PodsHandler) podProvisionConcurrencyLimit() int {
	if h.PodProvisionLimiter == nil {
		return 2
	}
	return h.PodProvisionLimiter.Limit()
}

func (h *PodsHandler) acquirePodProvisionSlot(ctx context.Context) (func(), error) {
	if h.PodProvisionLimiter == nil {
		return func() {}, nil
	}
	return h.PodProvisionLimiter.Acquire(ctx)
}

func (l *PodProvisionLimiter) Acquire(ctx context.Context) (release func(), err error) {
	if err := l.sem.Acquire(ctx, 1); err != nil {
		return nil, err
	}
	return func() { l.sem.Release(1) }, nil
}
