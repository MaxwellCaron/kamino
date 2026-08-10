package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/personalpods"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
)

// PersonalPodRuntime adapts PodsHandler's clone/network/router mechanics to personalpods.Runtime.
type PersonalPodRuntime struct {
	h *PodsHandler
}

func NewPersonalPodRuntime(h *PodsHandler) *PersonalPodRuntime {
	return &PersonalPodRuntime{h: h}
}

func cloneTargetToPersonalPods(target podCloneTarget) personalpods.CloneTarget {
	return personalpods.CloneTarget{
		Key:               target.Key,
		NetworkProfileKey: target.NetworkProfileKey,
		LANVNet:           target.LANVNet,
		DMZVNet:           target.DMZVNet,
		WANBridge:         target.WANBridge,
		WANSubnet:         target.WANSubnet,
		NetworkMin:        target.NetworkMin,
		NetworkMax:        target.NetworkMax,
		CloudInitStorage:  target.CloudInitStorage,
	}
}

func cloneTargetFromPersonalPods(target personalpods.CloneTarget) podCloneTarget {
	return podCloneTarget{
		Key:               target.Key,
		NetworkProfileKey: target.NetworkProfileKey,
		LANVNet:           target.LANVNet,
		DMZVNet:           target.DMZVNet,
		WANBridge:         target.WANBridge,
		WANSubnet:         target.WANSubnet,
		NetworkMin:        target.NetworkMin,
		NetworkMax:        target.NetworkMax,
		CloudInitStorage:  target.CloudInitStorage,
	}
}

// personalPodsErrorFromRequestError converts a requestError to its equivalent kind at the package boundary.
func personalPodsErrorFromRequestError(reqErr *requestError) *personalpods.Error {
	if reqErr == nil {
		return nil
	}

	kind := personalpods.KindInternal
	switch reqErr.Status {
	case http.StatusConflict, http.StatusServiceUnavailable:
		kind = personalpods.KindConflict
	case http.StatusNotFound:
		kind = personalpods.KindNotFound
	case http.StatusUnprocessableEntity:
		kind = personalpods.KindValidation
	case http.StatusBadGateway:
		kind = personalpods.KindUpstream
	}

	return &personalpods.Error{
		Kind:        kind,
		UserMessage: reqErr.UserMessage,
		Operation:   reqErr.Operation,
		Err:         reqErr.Err,
	}
}

func (r *PersonalPodRuntime) ResolveProvisionContext(ctx context.Context) (personalpods.ProvisionContext, error) {
	h := r.h

	target, reqErr := h.personalPodCloneTarget(ctx)
	if reqErr != nil {
		return personalpods.ProvisionContext{}, personalPodsErrorFromRequestError(reqErr)
	}

	rootID, err := h.ensurePersonalPodsFolderID(ctx)
	if err != nil {
		if errors.Is(err, errConfiguredPersonalPodsFolderMissing) {
			return personalpods.ProvisionContext{}, personalPodsErrorFromRequestError(&requestError{
				Status:      http.StatusConflict,
				UserMessage: err.Error(),
			})
		}
		return personalpods.ProvisionContext{}, personalPodsErrorFromRequestError(inventoryRequestError(err))
	}

	return personalpods.ProvisionContext{
		RootFolderID: rootID,
		CloneTarget:  cloneTargetToPersonalPods(target),
	}, nil
}

func (r *PersonalPodRuntime) ProvisionRouter(ctx context.Context, req personalpods.ProvisionRouterRequest) error {
	h := r.h
	personalTarget := cloneTargetFromPersonalPods(req.CloneTarget)

	if reqErr := h.ensureSharedVNetsValid(ctx, []string{personalTarget.LANVNet}); reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(reqErr)
	}

	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, req.FolderID, 1, "personal_pod_create")
	if err != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(inventoryRequestError(err))
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, req.FolderID)
	if err != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(inventoryRequestError(err))
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(&requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve personal pod clone target node",
			Err:         err,
		})
	}

	source, reqErr := h.resolvePublishedPodVMTemplate(ctx, h.PersonalPodRouterTemplateItemID)
	if reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(reqErr)
	}

	personalBatch, batchErr := h.Allocator.NewBatch(ctx, h.PersonalVMIDRange, 1)
	if batchErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, nil)
		return personalPodsErrorFromRequestError(&requestError{
			Status:      http.StatusBadGateway,
			UserMessage: fmt.Sprintf("no available VMID in personal pod range (%d–%d)", h.PersonalVMIDRange.Min, h.PersonalVMIDRange.Max),
			Operation:   "allocate personal pod VMID",
			Err:         batchErr,
		})
	}
	defer personalBatch.Release()

	created := make(map[int]clonedVM, 1)
	clone, reqErr := h.cloneVerifiedVMIntoFolder(
		ctx,
		source,
		h.PersonalPodRouterTemplateItemID,
		placement,
		targetNode,
		"router",
		false,
		cloneVMOptions{
			batch: personalBatch,
			onStarted: func(clone clonedVM) {
				created[clone.VMID] = clone
			},
			onSynced: func(clone clonedVM) {
				created[clone.VMID] = clone
			},
		},
	)
	if reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(reqErr)
	}

	linkedRows, err := database.New(h.DB).SetPersonalPodRouterInventoryItem(ctx, database.SetPersonalPodRouterInventoryItemParams{
		InventoryItemID: &clone.InventoryItemID,
		PersonalPodID:   &req.PersonalPodID,
	})
	if err != nil || linkedRows != 1 {
		if err == nil {
			err = fmt.Errorf("linked %d personal pod network allocations", linkedRows)
		}
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(&requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save personal pod router metadata",
			Operation:   "link personal pod router inventory item",
			Err:         err,
		})
	}

	targets := []podNetworkVMTarget{{
		name:   "router",
		clone:  clone,
		router: true,
	}}
	if reqErr := h.waitForPodVMTargetsReady(ctx, targets); reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(reqErr)
	}
	if reqErr := h.configureProfileNetworkAttachments(
		ctx,
		personalTarget,
		podnetwork.ProfileLANRouterV1,
		req.NetworkNumber,
		targets,
		map[string]string{},
	); reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(reqErr)
	}

	cloudInitConfig, err := buildRouterCloudInitConfigForProfile(
		req.NetworkNumber,
		podnetwork.ProfileLANRouterV1,
		personalTarget,
	)
	if err != nil {
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(&requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to build router cloud-init configuration",
			Operation:   "build personal router cloud-init configuration",
			Err:         err,
		})
	}
	if reqErr := h.configurePodRouterCloudInit(ctx, cloudInitConfig, targets); reqErr != nil {
		h.cleanupFailedPodProvision(req.FolderID, created)
		return personalPodsErrorFromRequestError(reqErr)
	}

	return nil
}

func (r *PersonalPodRuntime) CleanupFailedProvision(ctx context.Context, folderID uuid.UUID) {
	r.h.cleanupFailedPodProvision(folderID, nil)
}
