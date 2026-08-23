package handlers

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
)

type clonedPodVMDeleteTarget struct {
	Node string
	VMID int
}

func clonedPodVMDeleteTargets(rows []database.ListClonedPodVMsRow) []clonedPodVMDeleteTarget {
	targets := make([]clonedPodVMDeleteTarget, 0, len(rows))
	for _, row := range rows {
		if row.Node == nil || row.Vmid == nil {
			continue
		}
		targets = append(targets, clonedPodVMDeleteTarget{
			Node: *row.Node,
			VMID: int(*row.Vmid),
		})
	}
	return targets
}

func runBoundedClonedPodVMDeletes(
	ctx context.Context,
	limit int,
	targets []clonedPodVMDeleteTarget,
	deleteFn func(ctx context.Context, node string, vmid int) error,
) error {
	if len(targets) == 0 {
		return nil
	}

	results := runBoundedActions(ctx, limit, targets, func(ctx context.Context, index int, target clonedPodVMDeleteTarget) error {
		return deleteFn(ctx, target.Node, target.VMID)
	})

	var errs []error
	for i, result := range results {
		if result.Err == nil {
			continue
		}
		target := targets[i]
		errs = append(errs, fmt.Errorf("delete Proxmox VM %d on %s: %w", target.VMID, target.Node, result.Err))
	}
	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}

func (h *PodsHandler) deleteClonedPodProxmoxVMs(ctx context.Context, rows []database.ListClonedPodVMsRow) error {
	targets := clonedPodVMDeleteTargets(rows)
	return runBoundedClonedPodVMDeletes(ctx, h.vmOperationConcurrencyLimit(), targets, h.deleteClonedPodProxmoxVM)
}
