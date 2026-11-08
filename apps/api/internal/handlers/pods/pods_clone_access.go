package pods

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/vmaccess"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func vmidsFromTargets(targets []vmactions.Target) []int {
	vmids := make([]int, 0, len(targets))
	for _, target := range targets {
		vmids = append(vmids, target.VMID)
	}
	return vmids
}

func cloneMutationAllowed(isManager bool, ownerPrincipalID, actorPrincipalID uuid.UUID) bool {
	return isManager || ownerPrincipalID == actorPrincipalID
}

func (h *PodsHandler) loadAccessibleClonedPod(
	ctx context.Context,
	q *database.Queries,
	currentPrincipalID uuid.UUID,
	cloneID uuid.UUID,
) (database.ClonedPods, *httpx.RequestError) {
	clone, err := q.GetAccessibleClonedPodByID(ctx, database.GetAccessibleClonedPodByIDParams{
		ID:          cloneID,
		PrincipalID: currentPrincipalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load accessible cloned pod",
			Err:         err,
		}
	}
	return clone, nil
}

func (h *PodsHandler) loadClonedPodForMutation(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
) (database.ClonedPods, *httpx.RequestError) {
	isManager, err := h.Authz.IsManager(ctx, principalID)
	if err != nil {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize cloned pod mutation",
			Err:         err,
		}
	}

	clone, err := q.GetClonedPodByID(ctx, cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load cloned pod for mutation",
			Err:         err,
		}
	}

	if !cloneMutationAllowed(isManager, clone.UserPrincipalID, principalID) {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}

	return clone, nil
}

func (h *PodsHandler) resolveClonedPodPowerTargets(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
	required authorization.Mask,
) ([]vmactions.Target, *httpx.RequestError) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return nil, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod virtual machines",
			Operation:   "list cloned pod VMs for action",
			Err:         err,
		}
	}

	targets := make([]vmactions.Target, 0, len(rows))
	for _, row := range rows {
		target, reqErr := vmaccess.ResolveVerifiedVMItemPermission(
			ctx,
			h.Authz,
			h.PX,
			principalID,
			row.InventoryItemID,
			required,
			true,
		)
		if reqErr != nil {
			return nil, reqErr
		}
		targets = append(targets, target)
	}

	if len(targets) == 0 {
		return nil, &httpx.RequestError{
			Status:      http.StatusConflict,
			UserMessage: "cloned pod has no virtual machines",
		}
	}

	return targets, nil
}

func (h *PodsHandler) deleteClonedPodProxmoxVM(ctx context.Context, node string, vmid int) error {
	release, err := h.acquireVMOperationSlot(ctx)
	if err != nil {
		return fmt.Errorf("acquire VM operation slot for VM %d on %s: %w", vmid, node, err)
	}
	defer release()

	if err := h.PX.DeleteVM(ctx, proxmox.GuestQEMU, node, vmid); err == nil || proxmox.IsMissingVMError(err) {
		return nil
	}

	if err := h.PX.StopVM(ctx, proxmox.GuestQEMU, node, vmid); err != nil {
		if proxmox.IsMissingVMError(err) {
			return nil
		}
		return err
	}
	if err := h.PX.DeleteVM(ctx, proxmox.GuestQEMU, node, vmid); err != nil && !proxmox.IsMissingVMError(err) {
		return err
	}
	return nil
}

func (h *PodsHandler) visibleCatalogPodBySlug(
	ctx context.Context,
	principalID uuid.UUID,
	rawSlug string,
) (publishedPodBase, *httpx.RequestError) {
	slug := strings.TrimSpace(rawSlug)
	if slug == "" {
		return publishedPodBase{}, &httpx.RequestError{Status: http.StatusBadRequest, UserMessage: "invalid slug"}
	}

	q := database.New(h.DB)
	isProtected, err := h.Authz.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return publishedPodBase{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize published pod catalog item",
			Err:         err,
		}
	}

	if isProtected {
		rows, err := q.ListPublishedPods(ctx)
		if err != nil {
			return publishedPodBase{}, &httpx.RequestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load pod",
				Operation:   "list protected published pods for clone",
				Err:         err,
			}
		}
		for _, row := range listPublishedRowsToBase(rows) {
			if row.Slug == slug && row.Status == database.PublishedPodStatusListed {
				return row, nil
			}
		}
		return publishedPodBase{}, &httpx.RequestError{Status: http.StatusNotFound, UserMessage: "pod not found"}
	}

	row, err := q.GetVisiblePublishedPodBySlug(ctx, database.GetVisiblePublishedPodBySlugParams{
		Slug:        slug,
		PrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return publishedPodBase{}, &httpx.RequestError{Status: http.StatusNotFound, UserMessage: "pod not found"}
	}
	if err != nil {
		return publishedPodBase{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod",
			Operation:   "get visible published pod by slug for clone",
			Err:         err,
		}
	}

	return visiblePublishedSlugRowToBase(row), nil
}
