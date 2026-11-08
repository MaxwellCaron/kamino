package pods

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/inventoryops"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) PowerPublishedPodClone(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}
	if h.Actions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm actions unavailable"})
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid id")
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid clone id")
		return
	}

	var req clonedPodPowerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.WriteInvalidRequest(c, "invalid request body")
		return
	}

	q := database.New(h.DB)
	clone, reqErr := h.loadPublishedPodCloneForManager(c.Request.Context(), q, podID, cloneID)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, req.Action, principalID) {
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	powerResult, reqErr := h.powerPublishedPodCloneForManager(
		c.Request.Context(),
		q,
		clone,
		req.Action,
		principalID,
	)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	summary, reqErr := h.publishedPodCloneSummaryByID(c.Request.Context(), q, podID, cloneID)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}
	publicResult := powerResult.toPublicResponse()
	summary.PowerResult = &publicResult

	c.JSON(http.StatusOK, summary)
	if len(powerResult.Failed) == 0 {
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "pod.power." + req.Action,
			TargetKind:       "pod",
			PodID:            &clone.PodID,
			Metadata:         map[string]any{"clone_id": clone.ID.String()},
		})
		return
	}

	h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.power." + req.Action,
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata: map[string]any{
			"clone_id":      clone.ID.String(),
			"failure_count": len(powerResult.Failed),
		},
	}, fmt.Sprintf("%d vm power failures", len(powerResult.Failed)))
}

func (h *PodsHandler) DeletePublishedPodClone(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid id")
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		httpx.WriteInvalidRequest(c, "invalid clone id")
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodByID(c.Request.Context(), cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for manager delete", err)
		return
	}
	if clone.PodID != podID {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, "delete", principalID) {
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	if reqErr := h.deleteClonedPodFolderResources(c.Request.Context(), clone); reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.delete",
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *PodsHandler) clonedPodManagerActionTargets(
	ctx context.Context,
	q *database.Queries,
	cloneID uuid.UUID,
) ([]vmactions.Target, *httpx.RequestError) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return nil, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod virtual machines",
			Operation:   "list cloned pod VMs for manager action",
			Err:         err,
		}
	}

	targets := make([]vmactions.Target, 0, len(rows))
	for _, row := range rows {
		record, err := h.Authz.GetVMRecord(ctx, row.InventoryItemID)
		switch {
		case err == nil:
		case errors.Is(err, pgx.ErrNoRows):
			return nil, &httpx.RequestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned pod VM is missing from inventory",
			}
		default:
			return nil, &httpx.RequestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to verify cloned pod VM",
				Operation:   "load cloned pod VM record for manager action",
				Err:         err,
			}
		}

		_, err = proxmox.VerifyVMIdentity(ctx, h.PX, proxmox.GuestType(record.GuestType), record.Node, int(record.Vmid), record.UpstreamUUID)
		switch {
		case err == nil:
		case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
			return nil, &httpx.RequestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned pod VM identity is not initialized in Proxmox",
			}
		case errors.Is(err, proxmox.ErrVMIdentityMismatch):
			return nil, &httpx.RequestError{Status: http.StatusConflict, UserMessage: "cloned pod VM has drifted from inventory"}
		default:
			return nil, &httpx.RequestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to verify cloned pod VM",
				Operation:   "verify cloned pod VM identity for manager action",
				Err:         err,
			}
		}

		targets = append(targets, vmactions.Target{
			ItemID:    record.InventoryItemID,
			Node:      record.Node,
			VMID:      int(record.Vmid),
			GuestType: proxmox.GuestType(record.GuestType),
		})
	}

	if len(targets) == 0 {
		return nil, &httpx.RequestError{
			Status:      http.StatusConflict,
			UserMessage: "cloned pod has no virtual machines",
		}
	}

	return targets, nil
}

func (h *PodsHandler) loadPublishedPodCloneForManager(
	ctx context.Context,
	q *database.Queries,
	podID uuid.UUID,
	cloneID uuid.UUID,
) (database.ClonedPods, *httpx.RequestError) {
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
			Operation:   "load cloned pod for manager action",
			Err:         err,
		}
	}
	if clone.PodID != podID {
		return database.ClonedPods{}, &httpx.RequestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	return clone, nil
}

func (h *PodsHandler) powerPublishedPodCloneForManager(
	ctx context.Context,
	q *database.Queries,
	clone database.ClonedPods,
	action string,
	principalID uuid.UUID,
) (podPowerExecutionResult, *httpx.RequestError) {
	targets, reqErr := h.clonedPodManagerActionTargets(ctx, q, clone.ID)
	if reqErr != nil {
		return podPowerExecutionResult{}, reqErr
	}

	statuses, _, err := h.runtimeForVMIDs(ctx, vmidsFromTargets(targets))
	if err != nil {
		return podPowerExecutionResult{}, &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load VM statuses",
			Operation:   "load cloned pod vm statuses for manager power",
			Err:         err,
		}
	}

	return h.runClaimedPodVMPowerActions(
		ctx,
		principalID,
		vmactions.PowerAction(action),
		targets,
		statuses,
	), nil
}

func (h *PodsHandler) deletePublishedPodCloneForManager(
	ctx context.Context,
	q *database.Queries,
	clone database.ClonedPods,
) *httpx.RequestError {
	return h.deleteClonedPodFolderResources(ctx, clone)
}

// deleteClonedPodFolderResources runs the shared Proxmox-then-metadata deletion sequence for a clone folder.
func (h *PodsHandler) deleteClonedPodFolderResources(
	ctx context.Context,
	clone database.ClonedPods,
) *httpx.RequestError {
	plan, err := h.Service.BuildFolderDeletionPlan(ctx, clone.FolderID)
	if err != nil {
		return inventoryRequestError(err)
	}

	if h.PX == nil && (len(plan.ProxmoxVMs) > 0 || len(plan.ProxmoxPools) > 0) {
		return &httpx.RequestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "proxmox client unavailable",
		}
	}

	var metadataErr error
	cbs := inventoryops.ProxmoxFolderResourceDeletionCallbacks(h.PX, h.Service, func(ctx context.Context) error {
		metadataErr = h.Service.DeleteFolder(ctx, clone.FolderID)
		return metadataErr
	})

	if err := inventoryops.RunFolderResourceDeletion(ctx, plan, h.vmOperationConcurrencyLimit(), cbs); err != nil {
		if metadataErr != nil {
			return inventoryRequestError(metadataErr)
		}
		return &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to delete cloned pod virtual machine",
			Operation:   "delete cloned pod folder resources",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) publishedPodCloneSummaryByID(
	ctx context.Context,
	q *database.Queries,
	podID uuid.UUID,
	cloneID uuid.UUID,
) (publishedPodCloneResponse, *httpx.RequestError) {
	clones, err := h.hydratePublishedPodClones(ctx, q, podID)
	if err != nil {
		return publishedPodCloneResponse{}, &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to reload cloned pods",
			Operation:   "hydrate published pod clones for summary",
			Err:         err,
		}
	}
	for _, resp := range clones {
		if resp.ID == cloneID {
			return resp, nil
		}
	}
	return publishedPodCloneResponse{}, &httpx.RequestError{
		Status:      http.StatusNotFound,
		UserMessage: "cloned pod not found after action",
	}
}
