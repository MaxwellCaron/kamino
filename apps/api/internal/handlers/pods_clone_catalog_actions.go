package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) GetCloneProgress(c *gin.Context) {
	if _, ok := currentPrincipalID(c); !ok {
		writeUnauthorized(c)
		return
	}

	progressID := strings.TrimSpace(c.Param("id"))
	if progressID == "" {
		writeInvalidRequest(c, "invalid progress id")
		return
	}

	snapshot, ok := clonedPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

type cloneProgressBatchResponse struct {
	ID    string                       `json:"id"`
	Items []publishPodProgressSnapshot `json:"items"`
}

func (h *PodsHandler) GetCloneProgressBatch(c *gin.Context) {
	if _, ok := currentPrincipalID(c); !ok {
		writeUnauthorized(c)
		return
	}

	batchID := strings.TrimSpace(c.Param("id"))
	if batchID == "" {
		writeInvalidRequest(c, "invalid progress id")
		return
	}

	items := clonedPodProgress.getBatch(batchID)
	if len(items) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress batch not found"})
		return
	}

	c.JSON(http.StatusOK, cloneProgressBatchResponse{
		ID:    batchID,
		Items: items,
	})
}

func (h *PodsHandler) GetCatalogPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	pod, reqErr := h.visibleCatalogPodBySlug(c.Request.Context(), principalID, c.Param("slug"))
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetAccessibleClonedPodByPodID(c.Request.Context(), database.GetAccessibleClonedPodByPodIDParams{
		PodID:       pod.ID,
		PrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusOK, nil)
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod by catalog pod", err)
		return
	}

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod", err)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) ListCatalogCloneSummaries(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	q := database.New(h.DB)
	isProtected, err := h.Authz.HasProtectedAccess(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize catalog clone summaries", err)
		return
	}

	var bases []publishedPodBase
	if isProtected {
		rows, err := q.ListPublishedPods(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod catalog", "list protected published pod catalog for clone summaries", err)
			return
		}
		for _, row := range listPublishedRowsToBase(rows) {
			if row.Status == database.PublishedPodStatusListed {
				bases = append(bases, row)
			}
		}
	} else {
		rows, err := q.ListVisiblePublishedPodsForPrincipal(c.Request.Context(), principalID)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load pod catalog", "list visible published pod catalog for clone summaries", err)
			return
		}
		bases = visiblePublishedRowsToBase(rows)
	}

	podIDs := make([]uuid.UUID, 0, len(bases))
	for _, base := range bases {
		podIDs = append(podIDs, base.ID)
	}

	if len(podIDs) == 0 {
		c.JSON(http.StatusOK, []catalogCloneSummaryResponse{})
		return
	}

	cloneRows, err := q.ListAccessibleClonedPodSummariesByPodIDs(c.Request.Context(), database.ListAccessibleClonedPodSummariesByPodIDsParams{
		Column1:     podIDs,
		PrincipalID: principalID,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load clone summaries", "list accessible cloned pod summaries", err)
		return
	}

	cloneIDs := make([]uuid.UUID, 0, len(cloneRows))
	for _, row := range cloneRows {
		cloneIDs = append(cloneIDs, row.ID)
	}
	statusByClone, err := h.clonedPodRuntimeStatusByCloneIDs(c.Request.Context(), q, cloneIDs)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load clone runtime status", "hydrate clone runtime status for summary", err)
		return
	}

	cloneByPodID := make(map[uuid.UUID]catalogCloneSummaryResponse, len(cloneRows))
	for _, row := range cloneRows {
		totalTasks := int(row.TaskTotal)
		completedTasks := int(row.TaskCompleted)
		progress := 0.0
		if totalTasks > 0 {
			progress = (float64(completedTasks) / float64(totalTasks)) * 100
		}

		cloneByPodID[row.PodID] = catalogCloneSummaryResponse{
			ID:       row.ID,
			PodID:    row.PodID,
			ClonedAt: pgTime(row.CreatedAt),
			Status:   statusByClone[row.ID],
			TaskSummary: catalogCloneTaskSummaryResponse{
				Total:     totalTasks,
				Completed: completedTasks,
				Progress:  progress,
			},
		}
	}

	result := make([]catalogCloneSummaryResponseWithPod, 0, len(bases))
	for _, base := range bases {
		summary, exists := cloneByPodID[base.ID]
		if !exists {
			continue
		}
		result = append(result, catalogCloneSummaryResponseWithPod{
			Summary: summary,
			Pod: catalogClonePodResponse{
				ID:          base.ID,
				Slug:        base.Slug,
				Title:       base.Title,
				Description: base.Description,
				ImageURL:    base.ImageURL,
			},
		})
	}

	c.JSON(http.StatusOK, result)
}

func (h *PodsHandler) CloneCatalogPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	username, ok := currentUsername(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	progress := newClonePodProgressReporter(c.Query("progress_id"))
	progress.set(cloneProgressStepFetching, "Fetching virtual machines in pod.")

	pod, reqErr := h.visibleCatalogPodBySlug(c.Request.Context(), principalID, c.Param("slug"))
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	folderName, err := cloneFolderName(username)
	if err != nil {
		progress.fail(err.Error())
		writeRequestError(c, &requestError{Status: http.StatusUnprocessableEntity, UserMessage: err.Error()})
		return
	}

	q := database.New(h.DB)
	if _, err := q.GetAccessibleClonedPodByPodID(c.Request.Context(), database.GetAccessibleClonedPodByPodIDParams{
		PodID:       pod.ID,
		PrincipalID: principalID,
	}); err == nil {
		progress.fail("pod already cloned")
		writeRequestError(c, &requestError{Status: http.StatusConflict, UserMessage: "pod already cloned"})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		progress.fail("failed to check cloned pod")
		writeLoggedError(c, http.StatusInternalServerError, "failed to check cloned pod", "check accessible cloned pod before clone", err)
		return
	}

	if !h.acquirePodCloneClaim(c, pod.ID, principalID, "clone", principalID) {
		progress.fail("another operation is already in progress for this pod")
		return
	}
	defer h.releasePodCloneClaim(pod.ID, principalID, c.Request.Context())

	clone, reqErr := h.clonePublishedPod(c.Request.Context(), principalID, folderName, pod, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		progress.fail("failed to load cloned pod details")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after clone", err)
		return
	}

	progress.succeed("Pod cloned successfully.")
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.clone",
		TargetKind:       "pod",
		PodID:            &pod.ID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) RecloneClonedPod(c *gin.Context) {
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

	progress := newClonePodProgressReporter(c.Query("progress_id"))
	progress.set(cloneProgressStepFetching, "Fetching virtual machines in pod.")

	q := database.New(h.DB)
	clone, reqErr := h.loadClonedPodForMutation(c.Request.Context(), q, principalID, cloneID)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, "reclone", principalID) {
		progress.fail("another operation is already in progress for this pod")
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	clone, reqErr = h.reclonePublishedPod(c.Request.Context(), clone.UserPrincipalID, clone, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		progress.fail("failed to load cloned pod details")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after reclone", err)
		return
	}

	progress.succeed("Pod virtual machines replaced successfully.")
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.reclone",
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
	c.JSON(http.StatusOK, response)
}
