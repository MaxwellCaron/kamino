package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

func (h *PodsHandler) updatePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, []uuid.UUID, *requestError) {
	if len(req.VirtualMachines) != len(existingVMs) {
		return nil, nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	selected := make(map[uuid.UUID]struct{}, len(req.UpdateVirtualMachines))
	for _, id := range req.UpdateVirtualMachines {
		selected[id] = struct{}{}
	}

	existingByID := make(map[uuid.UUID]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	existingByName := make(map[string]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	for _, vm := range existingVMs {
		existingByID[vm.SourceInventoryItemID] = vm
		existingByName[strings.ToLower(vm.Name)] = vm
	}

	seenExisting := make(map[uuid.UUID]struct{}, len(req.VirtualMachines))
	matchedSelected := make(map[uuid.UUID]struct{}, len(selected))
	publishedVMIDByRequestID := make(map[uuid.UUID]uuid.UUID, len(selected))
	updateVMs := make([]normalizedPublishPodVM, 0, len(selected))
	replacedTemplateIDs := make([]uuid.UUID, 0, len(selected))
	output := make([]normalizedPublishPodVM, len(req.VirtualMachines))

	for index, requestVM := range req.VirtualMachines {
		existing, ok := existingByID[requestVM.RequestInventoryItemID]
		if !ok {
			existing, ok = existingByName[strings.ToLower(requestVM.Name)]
		}
		if !ok {
			return nil, nil, invalidPublishPod("published VMs must match the existing Pod Template VMs")
		}
		if _, ok := seenExisting[existing.SourceInventoryItemID]; ok {
			return nil, nil, invalidPublishPod("duplicate VM in publish request")
		}
		seenExisting[existing.SourceInventoryItemID] = struct{}{}

		update := markSelectedUpdateVM(
			selected,
			matchedSelected,
			requestVM.RequestInventoryItemID,
			requestVM.SourceInventoryItemID,
			existing.SourceInventoryItemID,
		)
		if !update {
			output[index] = normalizedPublishPodVM{
				PublishedPodVMID:       existing.ID,
				RequestInventoryItemID: requestVM.RequestInventoryItemID,
				SourceInventoryItemID:  existing.SourceInventoryItemID,
				Name:                   existing.Name,
				CPUCount:               existing.CpuCount,
				MemoryGB:               memoryMBToGB(&existing.MemoryMb),
				StorageGB:              diskGBToInt(&existing.DiskGb),
				AllowMask:              requestVM.AllowMask,
				DenyMask:               requestVM.DenyMask,
			}
			continue
		}

		updateVMs = append(updateVMs, requestVM)
		publishedVMIDByRequestID[requestVM.RequestInventoryItemID] = existing.ID
		replacedTemplateIDs = append(replacedTemplateIDs, existing.SourceInventoryItemID)
	}

	if len(matchedSelected) != len(selected) {
		return nil, nil, invalidPublishPod("selected VM updates must match the published pod VMs")
	}
	if len(updateVMs) == 0 {
		return output, []uuid.UUID{}, nil
	}

	progress.set(publishProgressStepPreparing, "Preparing selected Pod Template VMs for update.")
	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM update",
	); reqErr != nil {
		return nil, nil, reqErr
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template update target node",
			Err:         err,
		}
	}

	updated, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, updateVMs, progress)
	if reqErr != nil {
		return nil, nil, reqErr
	}
	updatedByRequestID := make(map[uuid.UUID]normalizedPublishPodVM, len(updated))
	for _, vm := range updated {
		updatedByRequestID[vm.RequestInventoryItemID] = vm
	}
	for index, requestVM := range req.VirtualMachines {
		if output[index].SourceInventoryItemID != uuid.Nil {
			continue
		}
		updatedVM, ok := updatedByRequestID[requestVM.RequestInventoryItemID]
		if !ok {
			return nil, nil, invalidPublishPod("failed to match updated VM")
		}
		updatedVM.PublishedPodVMID = publishedVMIDByRequestID[requestVM.RequestInventoryItemID]
		output[index] = updatedVM
	}

	return output, replacedTemplateIDs, nil
}

func markSelectedUpdateVM(
	selected map[uuid.UUID]struct{},
	matched map[uuid.UUID]struct{},
	ids ...uuid.UUID,
) bool {
	update := false
	for _, id := range ids {
		if _, ok := selected[id]; ok {
			matched[id] = struct{}{}
			update = true
		}
	}
	return update
}

func (h *PodsHandler) preparePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	if req.SourceFolderID == uuid.Nil {
		return nil, invalidPublishPod("select a Pod Folder")
	}
	if len(req.VirtualMachines) == 0 {
		return nil, invalidPublishPod("select a Pod Folder with at least one VM")
	}

	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		req.SourceFolderID,
		authorization.CreateFolder,
		"authorize published pod template folder creation",
	); reqErr != nil {
		return nil, reqErr
	}

	progress.set(publishProgressStepPreparing, "Creating or finding the Pod Template Folder inside the selected Pod Folder.")

	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM creation",
	); reqErr != nil {
		return nil, reqErr
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, templateFolderID, int32(len(req.VirtualMachines)), "pod_template_vms")
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template clone target node",
			Err:         err,
		}
	}

	prepared, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, req.VirtualMachines, progress)
	if reqErr != nil {
		return nil, reqErr
	}

	return prepared, nil
}

// clonePreparedVMsIntoTemplates clones each Pod VM into the Pod Template Folder
// and converts it to a Pod Template VM, a few at a time, cleaning up on any
// failure.
func (h *PodsHandler) clonePreparedVMsIntoTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	vms []normalizedPublishPodVM,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	prepared := make([]normalizedPublishPodVM, len(vms))
	routerTemplateID := uuid.Nil
	for _, vm := range vms {
		if !vm.IsRouter {
			continue
		}

		var err error
		routerTemplateID, err = publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			SourceInventoryItemID: vm.SourceInventoryItemID,
			IsRouter:              vm.IsRouter,
		}, h.RouterTemplateItemID)
		if err != nil {
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: err.Error(),
			}
		}
		if _, reqErr := h.resolvePublishedPodVMTemplate(ctx, routerTemplateID); reqErr != nil {
			return nil, reqErr
		}
		break
	}

	// Count non-router VMs; only those are cloned and need VMID allocation.
	nonRouterCount := 0
	for _, vm := range vms {
		if !isPodRouterName(vm.Name) {
			nonRouterCount++
		}
	}
	var batch *vmidalloc.Batch
	if nonRouterCount > 0 {
		var batchErr error
		batch, batchErr = h.Allocator.NewBatch(ctx, h.PublishVMIDRange, nonRouterCount)
		if batchErr != nil {
			return nil, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: fmt.Sprintf("insufficient VMID capacity in publish range (%d–%d) for %d VMs", h.PublishVMIDRange.Min, h.PublishVMIDRange.Max, nonRouterCount),
				Operation:   "allocate publish VMID batch",
				Err:         batchErr,
			}
		}
		defer batch.Release()
	}

	created := make(map[int]clonedVM, len(vms))
	var createdMu sync.Mutex

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)

	for i, vm := range vms {
		if isPodRouterName(vm.Name) {
			out := vm
			out.SourceInventoryItemID = routerTemplateID
			prepared[i] = out
			continue
		}

		group.Go(func() error {
			progress.set(publishProgressStepCloning, "Cloning Pod VM "+vm.Name)
			clone, reqErr := h.cloneVMIntoFolder(gctx, principalID, vm.SourceInventoryItemID, placement, targetNode, vm.Name, true, cloneVMOptions{
				batch: batch,
				onStarted: func(node string, vmid int) {
					createdMu.Lock()
					created[vmid] = clonedVM{TargetNode: node, VMID: vmid}
					createdMu.Unlock()
				},
			})
			if reqErr != nil {
				return reqErr
			}
			createdMu.Lock()
			created[clone.VMID] = clone
			createdMu.Unlock()

			progress.set(publishProgressStepCloning, "Converting "+vm.Name+" to a Pod Template VM")
			if reqErr := h.convertCloneToTemplate(gctx, clone); reqErr != nil {
				return reqErr
			}

			out := vm
			out.SourceInventoryItemID = clone.InventoryItemID
			prepared[i] = out
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		h.cleanupPublishClones(created)
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return nil, reqErr
		}
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone Pod VMs",
			Operation:   "clone published pod VMs",
			Err:         err,
		}
	}

	return prepared, nil
}
