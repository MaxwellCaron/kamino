package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) ReclonePublishedPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		writeInvalidRequest(c, "invalid clone id")
		return
	}

	q := database.New(h.DB)
	clone, reqErr := h.loadPublishedPodCloneForManager(c.Request.Context(), q, podID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	if !h.acquirePodCloneClaim(c, clone.PodID, clone.UserPrincipalID, "reclone", principalID) {
		return
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, c.Request.Context())

	if _, reqErr := h.reclonePublishedPod(c.Request.Context(), clone.UserPrincipalID, clone, nil); reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	summary, reqErr := h.publishedPodCloneSummaryByID(c.Request.Context(), q, podID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}
	c.JSON(http.StatusOK, summary)
}

func (h *PodsHandler) BulkActionPublishedPodClones(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req publishedPodCloneBulkActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	if (req.Action == "start" || req.Action == "shutdown") && h.Actions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm actions unavailable"})
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	q := database.New(h.DB)
	if _, err := q.GetPublishedPodByID(c.Request.Context(), podID); errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "published pod not found"})
		return
	} else if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "load published pod for bulk clone action", err)
		return
	}

	clones, err := q.ListClonedPodsByPodID(c.Request.Context(), podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pods", "list cloned pods for bulk action", err)
		return
	}

	resp := publishedPodCloneBulkActionResponse{
		Action:    req.Action,
		Succeeded: []uuid.UUID{},
		Failed:    []publishedPodCloneBulkActionFailure{},
	}

	switch req.Action {
	case "start", "shutdown":
		type bulkCloneOutcome struct {
			cloneID   uuid.UUID
			userID    uuid.UUID
			succeeded bool
			reqErr    *requestError
		}
		outcomes := make([]bulkCloneOutcome, len(clones))
		_ = runBoundedPowerActions(c.Request.Context(), h.Actions.PowerConcurrency(), clones, func(ctx context.Context, index int, clone database.ClonedPods) error {
			outcome := bulkCloneOutcome{cloneID: clone.ID, userID: clone.UserPrincipalID}
			if reqErr := h.claimPodCloneForMutation(ctx, clone.PodID, clone.UserPrincipalID, req.Action, principalID); reqErr != nil {
				outcome.reqErr = reqErr
				outcomes[index] = outcome
				return nil
			}
			defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, ctx)

			powerResult, powerErr := h.powerPublishedPodCloneForManager(ctx, q, clone, req.Action, principalID)
			if powerErr != nil {
				outcome.reqErr = powerErr
			} else if cloneFailedFromPowerResult(powerResult) {
				outcome.reqErr = &requestError{
					UserMessage: fmt.Sprintf("%d vm power failures", len(powerResult.Failed)),
				}
			} else {
				outcome.succeeded = true
			}
			outcomes[index] = outcome
			return nil
		})

		for _, outcome := range outcomes {
			if outcome.reqErr != nil {
				log.Printf("bulk clone action %s clone_id=%s: %v", req.Action, outcome.cloneID, outcome.reqErr.UserMessage)
				resp.Failed = append(resp.Failed, publishedPodCloneBulkActionFailure{
					ID:    outcome.cloneID,
					Error: outcome.reqErr.UserMessage,
				})
				h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
					ActorPrincipalID: &principalID,
					ActionKind:       "pod." + req.Action,
					TargetKind:       "pod",
					PodID:            &podID,
					Metadata:         map[string]any{"clone_id": outcome.cloneID.String()},
				}, outcome.reqErr.UserMessage)
				continue
			}
			if outcome.succeeded {
				resp.Succeeded = append(resp.Succeeded, outcome.cloneID)
				h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
					ActorPrincipalID: &principalID,
					ActionKind:       "pod." + req.Action,
					TargetKind:       "pod",
					PodID:            &podID,
					Metadata:         map[string]any{"clone_id": outcome.cloneID.String()},
				})
			}
		}
	default:
		for _, clone := range clones {
			var reqErr *requestError
			switch req.Action {
			case "reclone":
				reqErr = h.runClaimedPodCloneMutation(c.Request.Context(), clone, "reclone", principalID, func() *requestError {
					_, reqErr := h.reclonePublishedPod(c.Request.Context(), clone.UserPrincipalID, clone, nil)
					return reqErr
				})
			case "delete":
				reqErr = h.runClaimedPodCloneMutation(c.Request.Context(), clone, "delete", principalID, func() *requestError {
					return h.deletePublishedPodCloneForManager(c.Request.Context(), q, clone)
				})
			}
			if reqErr != nil {
				log.Printf("bulk clone action %s clone_id=%s: %v", req.Action, clone.ID, reqErr.UserMessage)
				resp.Failed = append(resp.Failed, publishedPodCloneBulkActionFailure{
					ID:    clone.ID,
					Error: reqErr.UserMessage,
				})
				h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
					ActorPrincipalID: &principalID,
					ActionKind:       "pod." + req.Action,
					TargetKind:       "pod",
					PodID:            &podID,
					Metadata:         map[string]any{"clone_id": clone.ID.String()},
				}, reqErr.UserMessage)
				continue
			}
			resp.Succeeded = append(resp.Succeeded, clone.ID)
			h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "pod." + req.Action,
				TargetKind:       "pod",
				PodID:            &podID,
				Metadata:         map[string]any{"clone_id": clone.ID.String()},
			})
		}
	}

	c.JSON(http.StatusOK, resp)
}

func (h *PodsHandler) CreatePublishedPodCloneForPrincipal(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	var req createPublishedPodCloneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	progress := newClonePodProgressReporter(req.ProgressID)
	progress.set(cloneProgressStepFetching, "Fetching virtual machines in pod.")

	q := database.New(h.DB)
	podRow, err := q.GetPublishedPodByID(c.Request.Context(), podID)
	if errors.Is(err, pgx.ErrNoRows) {
		progress.fail("pod not found")
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}
	if err != nil {
		progress.fail("failed to load pod")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "load published pod for manager clone", err)
		return
	}
	pod := publishedRowToBase(podRow)

	principals, err := q.ListPrincipalDetailsByIDs(c.Request.Context(), []uuid.UUID{req.PrincipalID})
	if err != nil {
		progress.fail("failed to load principal")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load principal", "load target principal for manager clone", err)
		return
	}
	if len(principals) == 0 {
		progress.fail("principal not found")
		c.JSON(http.StatusNotFound, gin.H{"error": "principal not found"})
		return
	}
	target := principals[0]

	if _, err := q.GetConflictingClonedPodForPrincipalByPodID(c.Request.Context(), database.GetConflictingClonedPodForPrincipalByPodIDParams{
		PodID:           pod.ID,
		UserPrincipalID: req.PrincipalID,
	}); err == nil {
		progress.fail("pod already cloned")
		writeRequestError(c, &requestError{Status: http.StatusConflict, UserMessage: "pod already cloned"})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		progress.fail("failed to check cloned pod")
		writeLoggedError(c, http.StatusInternalServerError, "failed to check cloned pod", "check conflicting cloned pod for manager clone", err)
		return
	}

	displayLabel := target.ExternalID
	if target.Name != nil && *target.Name != "" {
		displayLabel = *target.Name
	}

	folderName, err := managerCloneFolderName(displayLabel)
	if err != nil {
		progress.fail(err.Error())
		writeRequestError(c, &requestError{Status: http.StatusUnprocessableEntity, UserMessage: err.Error()})
		return
	}

	if !h.acquirePodCloneClaim(c, pod.ID, req.PrincipalID, "clone", principalID) {
		progress.fail("another operation is already in progress for this pod")
		return
	}
	defer h.releasePodCloneClaim(pod.ID, req.PrincipalID, c.Request.Context())

	clone, reqErr := h.clonePublishedPod(c.Request.Context(), req.PrincipalID, folderName, pod, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	summary, reqErr := h.publishedPodCloneSummaryByID(c.Request.Context(), q, podID, clone.ID)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	progress.succeed("Pod cloned successfully.")
	c.JSON(http.StatusOK, summary)
}
