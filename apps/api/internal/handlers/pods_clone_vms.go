package handlers

import (
	"context"
	"errors"
	"net/http"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

func (h *PodsHandler) clonePublishedPodVMs(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	publishedVMs []database.ListPublishedPodVMsForCloneRow,
	batch *vmidalloc.Batch,
	progress *clonePodProgressReporter,
) ([]clonePublishedVMResult, map[int]clonedVM, *requestError) {
	results := make([]clonePublishedVMResult, len(publishedVMs))
	created := make(map[int]clonedVM, len(publishedVMs))
	var createdMu sync.Mutex

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(h.podProvisionConcurrencyLimit())

	for index, publishedVM := range publishedVMs {
		index, publishedVM := index, publishedVM
		group.Go(func() error {
			progress.set(cloneProgressStepCloning, "Cloning "+publishedVM.Name+" into a Cloned Pod VM")
			router := isPublishedPodRouterVM(publishedVM)
			sourceItemID, err := publishedPodVMTemplateItemID(
				publishedVM,
				h.RouterTemplateItemID,
			)
			if err != nil {
				return &requestError{
					Status:      http.StatusConflict,
					UserMessage: err.Error(),
				}
			}
			source, reqErr := h.resolvePublishedPodVMTemplate(gctx, sourceItemID)
			if reqErr != nil {
				return reqErr
			}

			clone, reqErr := h.cloneVerifiedVMIntoFolder(
				gctx,
				source,
				sourceItemID,
				placement,
				targetNode,
				publishedVM.Name,
				false,
				cloneVMOptions{
					batch: batch,
					onStarted: func(clone clonedVM) {
						createdMu.Lock()
						created[clone.VMID] = clone
						createdMu.Unlock()
					},
				},
			)
			if reqErr != nil {
				return reqErr
			}

			if reqErr := h.applyPublishedPodVMPermissions(gctx, principalID, clone.InventoryItemID, publishedVM); reqErr != nil {
				return reqErr
			}

			createdMu.Lock()
			created[clone.VMID] = clone
			createdMu.Unlock()
			results[index] = clonePublishedVMResult{
				published: publishedVM,
				clone:     clone,
				router:    router,
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return nil, created, reqErr
		}
		return nil, created, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone Pod Template VMs",
			Operation:   "clone published Pod Template VMs",
			Err:         err,
		}
	}

	return results, created, nil
}

func (h *PodsHandler) resolvePublishedPodVMTemplate(
	ctx context.Context,
	sourceItemID uuid.UUID,
) (verifiedVMTarget, *requestError) {
	record, err := h.Authz.GetVMRecord(ctx, sourceItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "published Pod Template VM is missing from inventory",
		}
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to verify Pod Template VM",
			Operation:   "load published Pod Template VM record",
			Err:         err,
		}
	}

	identity, err := h.PX.GetVMIdentity(ctx, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid))
	switch {
	case err == nil:
	case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "published Pod Template VM identity is not initialized in Proxmox",
		}
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to verify Pod Template VM",
			Operation:   "verify published Pod Template VM identity",
			Err:         err,
		}
	}

	if identity.UpstreamUUID != record.UpstreamUUID {
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "published Pod Template VM has drifted from inventory",
		}
	}
	if !identity.IsTemplate {
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "published Pod Template VM is no longer a Proxmox template",
		}
	}

	return verifiedVMTarget{
		ItemID:       record.InventoryItemID,
		Node:         record.Node,
		VMID:         int(record.Vmid),
		UpstreamUUID: record.UpstreamUUID,
		GuestType:    proxmox.GuestType(record.GuestType),
	}, nil
}

func (h *PodsHandler) applyPublishedPodVMPermissions(
	ctx context.Context,
	principalID uuid.UUID,
	clonedItemID uuid.UUID,
	publishedVM database.ListPublishedPodVMsForCloneRow,
) *requestError {
	entries := make([]inventory.ACLEntryInput, 0, 2)
	if publishedVM.AllowMask > 0 {
		entries = append(entries, inventory.ACLEntryInput{
			PrincipalID: principalID,
			Effect:      database.InventoryAceEffectAllow,
			Permissions: publishedVM.AllowMask,
		})
	}
	if publishedVM.DenyMask > 0 {
		entries = append(entries, inventory.ACLEntryInput{
			PrincipalID: principalID,
			Effect:      database.InventoryAceEffectDeny,
			Permissions: publishedVM.DenyMask,
		})
	}

	if err := h.Service.ReplaceInventoryACL(ctx, clonedItemID, entries); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to apply cloned VM permissions",
			Operation:   "apply published pod VM ACL",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) createClonedPodRecord(
	ctx context.Context,
	principalID uuid.UUID,
	podID uuid.UUID,
	folderID uuid.UUID,
	networkProfileKey string,
) (database.ClonedPods, *requestError) {
	q := database.New(h.DB)
	cloneRow, err := q.InsertClonedPod(ctx, database.InsertClonedPodParams{
		ID:                uuid.New(),
		PodID:             podID,
		UserPrincipalID:   principalID,
		FolderID:          folderID,
		NetworkProfileKey: &networkProfileKey,
		MinNetworkNumber:  h.RouterCloneConfig.NetworkMin,
		MaxNetworkNumber:  h.RouterCloneConfig.NetworkMax,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "no pod network numbers available",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to reserve pod network number",
			Operation:   "insert cloned pod network allocation",
			Err:         err,
		}
	}
	return database.ClonedPods{
		ID:                cloneRow.ID,
		PodID:             cloneRow.PodID,
		UserPrincipalID:   cloneRow.UserPrincipalID,
		FolderID:          cloneRow.FolderID,
		NetworkNumber:     cloneRow.NetworkNumber,
		NetworkProfileKey: cloneRow.NetworkProfileKey,
		CreatedAt:         cloneRow.CreatedAt,
		UpdatedAt:         cloneRow.UpdatedAt,
	}, nil
}

func (h *PodsHandler) recordClonedPodDetails(
	ctx context.Context,
	clone database.ClonedPods,
	results []clonePublishedVMResult,
) *requestError {
	taskRows, questionCounts, reqErr := h.cloneTaskQuestionCounts(ctx, clone.PodID)
	if reqErr != nil {
		return reqErr
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod",
			Operation:   "begin cloned pod details tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	for _, result := range results {
		if err := q.InsertClonedPodVM(ctx, database.InsertClonedPodVMParams{
			ClonedPodID:      clone.ID,
			PublishedPodVmID: result.published.ID,
			InventoryItemID:  result.clone.InventoryItemID,
			SortOrder:        result.published.SortOrder,
		}); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to record cloned pod VMs",
				Operation:   "insert cloned pod VM",
				Err:         err,
			}
		}
	}

	for _, task := range taskRows {
		if err := q.InsertClonedPodTaskState(ctx, database.InsertClonedPodTaskStateParams{
			ClonedPodID: clone.ID,
			TaskID:      task.ID,
			Completed:   questionCounts[task.ID] == 0,
		}); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to record cloned pod task progress",
				Operation:   "insert cloned pod task state",
				Err:         err,
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod",
			Operation:   "commit cloned pod details tx",
			Err:         err,
		}
	}

	return nil
}
