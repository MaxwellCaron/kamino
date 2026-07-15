package handlers

import "context"

func (h *PodsHandler) vmOperationConcurrencyLimit() int {
	if h.Actions == nil {
		return 2
	}
	return h.Actions.OperationConcurrency()
}

func (h *PodsHandler) acquireVMOperationSlot(ctx context.Context) (func(), error) {
	if h.Actions == nil {
		return func() {}, nil
	}
	return h.Actions.AcquireOperationSlot(ctx)
}
