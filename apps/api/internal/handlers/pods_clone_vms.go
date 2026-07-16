package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/podnetworks"
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
	group.SetLimit(h.vmOperationConcurrencyLimit())

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

func (h *PodsHandler) preflightPublishedPodVMTemplatesForClone(
	ctx context.Context,
	publishedVMs []database.ListPublishedPodVMsForCloneRow,
) *requestError {
	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(h.vmOperationConcurrencyLimit())

	for _, publishedVM := range publishedVMs {
		publishedVM := publishedVM
		group.Go(func() error {
			sourceItemID, err := publishedPodVMTemplateItemID(publishedVM, h.RouterTemplateItemID)
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
			ready, err := h.PX.VMStorageReady(gctx, source.Node, source.VMID)
			if err != nil {
				log.Printf(
					"preflight published pod template storage: vm=%q item=%s node=%s vmid=%d: %v",
					publishedVM.Name,
					sourceItemID,
					source.Node,
					source.VMID,
					err,
				)
				return &requestError{
					Status:      http.StatusBadGateway,
					UserMessage: fmt.Sprintf("failed to verify published Pod Template VM %q", publishedVM.Name),
					Operation:   "preflight published pod template storage",
					Err:         err,
				}
			}
			if !ready {
				log.Printf(
					"preflight published pod template storage unavailable: vm=%q item=%s node=%s vmid=%d",
					publishedVM.Name,
					sourceItemID,
					source.Node,
					source.VMID,
				)
				return &requestError{
					Status: http.StatusConflict,
					UserMessage: fmt.Sprintf(
						`published Pod Template VM "%s" is unavailable; repair or republish the Pod`,
						publishedVM.Name,
					),
					Operation: "preflight published pod template storage",
				}
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return reqErr
		}
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to verify published Pod Template VMs",
			Operation:   "preflight published pod template storage",
			Err:         err,
		}
	}
	return nil
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
	var cloneRow database.InsertClonedPodRow
	err := podnetworks.WithPodNetworkAllocation(ctx, h.DB, func(ctx context.Context, tx pgx.Tx) error {
		var err error
		cloneRow, err = database.New(tx).InsertClonedPod(ctx, database.InsertClonedPodParams{
			ID:                uuid.New(),
			PodID:             podID,
			UserPrincipalID:   principalID,
			FolderID:          folderID,
			NetworkProfileKey: &networkProfileKey,
			MinNetworkNumber:  h.RouterCloneConfig.NetworkMin,
			MaxNetworkNumber:  h.RouterCloneConfig.NetworkMax,
		})
		return err
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
