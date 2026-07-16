package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) clonePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	folderName string,
	pod publishedPodBase,
	progress *clonePodProgressReporter,
) (database.ClonedPods, *requestError) {
	progress.set(cloneProgressStepFetching, "Fetching virtual machines in pod.")

	if err := names.ValidateFolder(folderName); err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	q := database.New(h.DB)
	if _, err := q.GetClonedPodForPrincipalByPodID(ctx, database.GetClonedPodForPrincipalByPodIDParams{
		PodID:           pod.ID,
		UserPrincipalID: principalID,
	}); err == nil {
		return database.ClonedPods{}, &requestError{Status: http.StatusConflict, UserMessage: "pod already cloned"}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to check cloned pod",
			Operation:   "check existing cloned pod",
			Err:         err,
		}
	}

	publishedVMs, err := q.ListPublishedPodVMsForClone(ctx, pod.ID)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod virtual machines",
			Operation:   "list published pod VMs for clone",
			Err:         err,
		}
	}
	if len(publishedVMs) == 0 {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "pod has no virtual machines to clone",
		}
	}

	if reqErr := h.preflightPublishedPodVMTemplatesForClone(ctx, publishedVMs); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if exists, err := h.Service.ChildFolderExists(ctx, pod.SourceFolderID, folderName); err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	} else if exists {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "pod clone folder already exists",
		}
	}

	targetFolderID, err := h.Service.CreateFolder(ctx, pod.SourceFolderID, folderName)
	if err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	}

	var batch *vmidalloc.Batch
	var created map[int]clonedVM
	provisioned := false
	defer func() {
		if !provisioned {
			h.cleanupFailedUserClone(targetFolderID, created)
		}
		batch.Release()
	}()

	var batchErr error
	batch, batchErr = h.Allocator.NewBatch(ctx, h.CloneVMIDRange, len(publishedVMs))
	if batchErr != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: fmt.Sprintf("insufficient VMID capacity in clone range (%d–%d) for %d VMs", h.CloneVMIDRange.Min, h.CloneVMIDRange.Max, len(publishedVMs)),
			Operation:   "allocate clone VMID batch",
			Err:         batchErr,
		}
	}

	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, targetFolderID, int32(len(publishedVMs)), "pod_clone")
	if err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, targetFolderID)
	if err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve cloned pod target node",
			Err:         err,
		}
	}

	clone, reqErr := h.createClonedPodRecord(ctx, principalID, pod.ID, targetFolderID, pod.NetworkProfileKey)
	if reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.ensureProfileVNetsExist(ctx, pod.NetworkProfileKey, clone.NetworkNumber); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	results, created, reqErr := h.provisionClonedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, clone, batch, progress)
	if reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.recordClonedPodDetails(ctx, clone, results); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	provisioned = true
	return clone, nil
}

func (h *PodsHandler) reclonePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	clone database.ClonedPods,
	progress *clonePodProgressReporter,
) (database.ClonedPods, *requestError) {
	progress.set(cloneProgressStepFetching, "Fetching virtual machines in pod.")

	q := database.New(h.DB)
	publishedVMs, err := q.ListPublishedPodVMsForClone(ctx, clone.PodID)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod virtual machines",
			Operation:   "list published pod VMs for reclone",
			Err:         err,
		}
	}
	if len(publishedVMs) == 0 {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "pod has no virtual machines to clone",
		}
	}

	if reqErr := h.preflightPublishedPodVMTemplatesForClone(ctx, publishedVMs); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.ensureClonedPodVNetExists(ctx, h.clonedPodVNetName(clone.NetworkNumber)); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepCloning, "Deleting existing cloned pod virtual machines.")
	if reqErr := h.deleteExistingClonedPodVMs(ctx, q, clone.ID); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	var batch *vmidalloc.Batch
	var created map[int]clonedVM
	provisioned := false
	defer func() {
		if !provisioned {
			h.cleanupFailedUserClone(uuid.Nil, created)
		}
		batch.Release()
	}()

	var batchErr error
	batch, batchErr = h.Allocator.NewBatch(ctx, h.CloneVMIDRange, len(publishedVMs))
	if batchErr != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: fmt.Sprintf("insufficient VMID capacity in clone range (%d–%d) for %d VMs", h.CloneVMIDRange.Min, h.CloneVMIDRange.Max, len(publishedVMs)),
			Operation:   "allocate clone VMID batch",
			Err:         batchErr,
		}
	}

	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, clone.FolderID, int32(len(publishedVMs)), "pod_reclone")
	if err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, clone.FolderID)
	if err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve recloned pod target node",
			Err:         err,
		}
	}

	results, created, reqErr := h.provisionClonedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, clone, batch, progress)
	if reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.recordReclonedPodVMs(ctx, clone.ID, results); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	provisioned = true
	return clone, nil
}

func (h *PodsHandler) provisionClonedPodVMs(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	publishedVMs []database.ListPublishedPodVMsForCloneRow,
	clone database.ClonedPods,
	batch *vmidalloc.Batch,
	progress *clonePodProgressReporter,
) ([]clonePublishedVMResult, map[int]clonedVM, *requestError) {
	progress.set(cloneProgressStepCloning, "Cloning virtual machines.")
	results, created, reqErr := h.clonePublishedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, batch, progress)
	if reqErr != nil {
		return nil, created, reqErr
	}

	progress.set(cloneProgressStepWaiting, "Preparing virtual machines.")
	if reqErr := h.waitForClonedVMsReady(ctx, results); reqErr != nil {
		return nil, created, reqErr
	}
	if reqErr := h.configureClonedPodNetwork(ctx, clone, results); reqErr != nil {
		return nil, created, reqErr
	}

	progress.set(cloneProgressStepRouter, "Starting router.")
	if reqErr := h.configureClonedRouter(ctx, clone, results); reqErr != nil {
		return nil, created, reqErr
	}

	return results, created, nil
}

func (h *PodsHandler) deleteExistingClonedPodVMs(
	ctx context.Context,
	q *database.Queries,
	cloneID uuid.UUID,
) *requestError {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod virtual machines",
			Operation:   "list cloned pod VMs for reclone",
			Err:         err,
		}
	}

	for _, row := range rows {
		if err := h.Service.EnsureInventorySubtreeDeletable(ctx, row.InventoryItemID); err != nil {
			return inventoryRequestError(err)
		}
	}

	for _, row := range rows {
		if row.Node != nil && row.Vmid != nil {
			if err := h.deleteClonedPodProxmoxVM(ctx, *row.Node, int(*row.Vmid)); err != nil {
				return &requestError{
					Status:      http.StatusBadGateway,
					UserMessage: "failed to delete cloned pod virtual machine",
					Operation:   "delete cloned pod VM for reclone",
					Err:         err,
				}
			}
		}
		if err := h.Service.DeleteInventoryVM(ctx, row.InventoryItemID); err != nil {
			return inventoryRequestError(err)
		}
	}

	return nil
}
