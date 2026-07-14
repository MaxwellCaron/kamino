package handlers

import (
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *PodsHandler) PowerClonedPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if h.Actions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm actions unavailable"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	var req clonedPodPowerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	q := database.New(h.DB)
	clone, reqErr := h.loadAccessibleClonedPod(c.Request.Context(), q, principalID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, req.Action, principalID) {
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	targets, reqErr := h.resolveClonedPodPowerTargets(
		c.Request.Context(),
		q,
		principalID,
		cloneID,
		authorization.PowerVM,
	)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	statuses, _, err := h.runtimeForVMIDs(c.Request.Context(), vmidsFromTargets(targets))
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to load VM statuses", "load cloned pod vm statuses", err)
		return
	}

	powerResult := h.runClaimedPodVMPowerActions(
		c.Request.Context(),
		principalID,
		vmactions.PowerAction(req.Action),
		targets,
		statuses,
	)

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after power action", err)
		return
	}
	publicResult := powerResult.toPublicResponse()
	response.PowerResult = &publicResult

	c.JSON(http.StatusOK, response)
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

func (h *PodsHandler) DeleteClonedPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	q := database.New(h.DB)
	clone, reqErr := h.loadClonedPodForMutation(c.Request.Context(), q, principalID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, "delete", principalID) {
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	rows, err := q.ListClonedPodVMs(c.Request.Context(), cloneID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod virtual machines", "list cloned pod VMs for delete", err)
		return
	}

	for _, row := range rows {
		if row.Node == nil || row.Vmid == nil {
			continue
		}
		if err := h.deleteClonedPodProxmoxVM(c.Request.Context(), *row.Node, int(*row.Vmid)); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to delete cloned pod virtual machine", "delete cloned pod VM", err)
			return
		}
	}

	if err := h.Service.DeleteFolder(c.Request.Context(), clone.FolderID); err != nil {
		writeInventoryError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.delete",
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
}
