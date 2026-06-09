package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/errgroup"
)

const (
	cloneProgressEventType    = "pod.clone.progress"
	cloneProgressStepFetching = 1
	cloneProgressStepCloning  = 2
	cloneProgressStepWaiting  = 3
	cloneProgressStepRouter   = 4
)

var clonedPodProgress = newPublishPodProgressStore()

type clonePodProgressReporter struct {
	id    string
	store *publishPodProgressStore
	mu    sync.Mutex
	step  int
}

type clonePublishedVMResult struct {
	published database.ListPublishedPodVMsForCloneRow
	clone     clonedVM
}

type clonedPodResponse struct {
	ID              uuid.UUID                         `json:"id"`
	PodID           uuid.UUID                         `json:"pod_id"`
	ClonedAt        time.Time                         `json:"cloned_at"`
	Status          string                            `json:"status"`
	VMs             []clonedPodVMResponse             `json:"vms"`
	TaskSummary     clonedPodTaskSummaryResponse      `json:"task_summary"`
	TaskStates      []clonedPodTaskStateResponse      `json:"task_states"`
	QuestionAnswers []clonedPodQuestionAnswerResponse `json:"question_answers"`
}

type clonedPodVMResponse struct {
	ID        uuid.UUID                    `json:"id"`
	Name      string                       `json:"name"`
	Status    string                       `json:"status"`
	Resources vmstatus.VMResources         `json:"resources"`
	Uptime    *int64                       `json:"uptime,omitempty"`
	Inventory clonedPodVMInventoryResponse `json:"inventory"`
}

type clonedPodVMInventoryResponse struct {
	ItemID uuid.UUID `json:"itemId"`
}

type clonedPodTaskSummaryResponse struct {
	Total     int     `json:"total"`
	Completed int     `json:"completed"`
	Progress  float64 `json:"progress"`
}

type clonedPodTaskStateResponse struct {
	TaskID      uuid.UUID  `json:"task_id"`
	Completed   bool       `json:"completed"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type clonedPodQuestionAnswerResponse struct {
	QuestionID uuid.UUID `json:"question_id"`
	Answer     string    `json:"answer"`
	IsCorrect  bool      `json:"is_correct"`
	AnsweredAt time.Time `json:"answered_at"`
}

type answerPodQuestionRequest struct {
	Answer string `json:"answer" binding:"required"`
}

type clonedPodPowerRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown"`
}

func newClonePodProgressReporter(id string) *clonePodProgressReporter {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	return &clonePodProgressReporter{id: id, store: clonedPodProgress}
}

func (r *clonePodProgressReporter) set(step int, message string) {
	r.emit(step, publishProgressStateRunning, message)
}

func (r *clonePodProgressReporter) succeed(message string) {
	r.emit(cloneProgressStepRouter, publishProgressStateSuccess, message)
}

func (r *clonePodProgressReporter) fail(message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	step := r.step
	r.mu.Unlock()
	if step == 0 {
		step = cloneProgressStepFetching
	}
	r.emit(step, publishProgressStateError, message)
}

func (r *clonePodProgressReporter) emit(step int, state, message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.step = step
	r.mu.Unlock()
	r.store.set(publishPodProgressSnapshot{
		Type:    cloneProgressEventType,
		ID:      r.id,
		State:   state,
		StepID:  step,
		Message: message,
	})
}

func (h *PodsHandler) GetCloneProgress(c *gin.Context) {
	if _, ok := currentPrincipalID(c); !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	progressID := strings.TrimSpace(c.Param("id"))
	if progressID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid progress id"})
		return
	}

	snapshot, ok := clonedPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

func (h *PodsHandler) GetCatalogPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	pod, reqErr := h.visibleCatalogPodBySlug(c.Request.Context(), principalID, c.Param("slug"))
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodForPrincipalByPodID(c.Request.Context(), database.GetClonedPodForPrincipalByPodIDParams{
		PodID:           pod.ID,
		UserPrincipalID: principalID,
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

func (h *PodsHandler) CloneCatalogPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	username, ok := currentUsername(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	progress := newClonePodProgressReporter(c.Query("progress_id"))
	progress.set(cloneProgressStepFetching, "Fetching Pod Template VMs.")

	pod, reqErr := h.visibleCatalogPodBySlug(c.Request.Context(), principalID, c.Param("slug"))
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	clone, reqErr := h.clonePublishedPod(c.Request.Context(), principalID, username, pod, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	q := database.New(h.DB)
	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		progress.fail("failed to load cloned pod details")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after clone", err)
		return
	}

	progress.succeed("Pod cloned successfully.")
	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) RecloneClonedPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	progress := newClonePodProgressReporter(c.Query("progress_id"))
	progress.set(cloneProgressStepFetching, "Fetching Pod Template VMs.")

	q := database.New(h.DB)
	clone, err := q.GetClonedPodForPrincipalByID(c.Request.Context(), database.GetClonedPodForPrincipalByIDParams{
		ID:              cloneID,
		UserPrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		progress.fail("cloned pod not found")
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		progress.fail("failed to load cloned pod")
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for reclone", err)
		return
	}

	clone, reqErr := h.reclonePublishedPod(c.Request.Context(), principalID, clone, progress)
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
	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) PowerClonedPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if h.Actions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm actions unavailable"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req clonedPodPowerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	q := database.New(h.DB)
	clone, targets, reqErr := h.clonedPodActionTargets(
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

	expectedStatus := "running"
	if req.Action == string(vmactions.PowerActionShutdown) {
		expectedStatus = "stopped"
	}

	for _, target := range targets {
		if clonedPodVMAlreadyInPowerState(req.Action, statuses[target.VMID]) {
			continue
		}

		if err := h.Actions.PowerAction(c.Request.Context(), target, vmactions.PowerAction(req.Action)); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to update cloned pod power state", "power cloned pod vm", err)
			return
		}
		if err := h.waitForVMStatus(c.Request.Context(), target.VMID, expectedStatus); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to confirm cloned pod power state", "wait for cloned pod vm power state", err)
			return
		}
	}

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after power action", err)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) DeleteClonedPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodForPrincipalByID(c.Request.Context(), database.GetClonedPodForPrincipalByIDParams{
		ID:              cloneID,
		UserPrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for delete", err)
		return
	}

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
}

func (h *PodsHandler) AnswerClonedPodQuestion(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	questionID, err := uuid.Parse(c.Param("questionID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}

	var req answerPodQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	answer := strings.TrimSpace(req.Answer)
	if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "answer must be between 1 and 256 characters"})
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodForPrincipalByID(c.Request.Context(), database.GetClonedPodForPrincipalByIDParams{
		ID:              cloneID,
		UserPrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for answer", err)
		return
	}

	question, err := q.GetQuestionForClonedPod(c.Request.Context(), database.GetQuestionForClonedPodParams{
		ClonedPodID:     cloneID,
		UserPrincipalID: principalID,
		QuestionID:      questionID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load question", "load cloned pod question", err)
		return
	}

	isCorrect := answersMatch(answer, question.AnswerOutline)
	if _, err := q.UpsertClonedPodQuestionAnswer(c.Request.Context(), database.UpsertClonedPodQuestionAnswerParams{
		ClonedPodID: cloneID,
		QuestionID:  question.ID,
		Answer:      answer,
		IsCorrect:   isCorrect,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert cloned pod question answer", err)
		return
	}

	remaining, err := q.CountIncorrectOrUnansweredTaskQuestions(c.Request.Context(), database.CountIncorrectOrUnansweredTaskQuestionsParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "count cloned pod task questions", err)
		return
	}
	if err := q.SetClonedPodTaskCompleted(c.Request.Context(), database.SetClonedPodTaskCompletedParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
		Completed:   remaining == 0,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "set cloned pod task completion", err)
		return
	}

	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after answer", err)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) clonedPodActionTargets(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
	required authorization.Mask,
) (database.ClonedPods, []vmactions.Target, *requestError) {
	clone, err := q.GetClonedPodForPrincipalByID(ctx, database.GetClonedPodForPrincipalByIDParams{
		ID:              cloneID,
		UserPrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, nil, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load cloned pod for action",
			Err:         err,
		}
	}

	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return database.ClonedPods{}, nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod virtual machines",
			Operation:   "list cloned pod VMs for action",
			Err:         err,
		}
	}

	targets := make([]vmactions.Target, 0, len(rows))
	for _, row := range rows {
		target, reqErr := resolveVerifiedVMItemPermission(
			ctx,
			h.Authz,
			h.PX,
			principalID,
			row.InventoryItemID,
			required,
			true,
		)
		if reqErr != nil {
			return database.ClonedPods{}, nil, reqErr
		}
		targets = append(targets, vmactions.Target{
			ItemID: target.ItemID,
			Node:   target.Node,
			VMID:   target.VMID,
		})
	}

	if len(targets) == 0 {
		return database.ClonedPods{}, nil, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "cloned pod has no virtual machines",
		}
	}

	return clone, targets, nil
}

func vmidsFromTargets(targets []vmactions.Target) []int {
	vmids := make([]int, 0, len(targets))
	for _, target := range targets {
		vmids = append(vmids, target.VMID)
	}
	return vmids
}

func clonedPodVMAlreadyInPowerState(action string, status string) bool {
	switch action {
	case string(vmactions.PowerActionStart):
		return status == "running"
	case string(vmactions.PowerActionShutdown):
		return status != "" && status != "running"
	default:
		return false
	}
}

func (h *PodsHandler) deleteClonedPodProxmoxVM(ctx context.Context, node string, vmid int) error {
	if err := h.PX.DeleteVM(ctx, node, vmid); err == nil || isMissingProxmoxVMError(err) {
		return nil
	}

	if err := h.PX.StopVM(ctx, node, vmid); err != nil {
		if isMissingProxmoxVMError(err) {
			return nil
		}
		return err
	}
	if err := h.PX.DeleteVM(ctx, node, vmid); err != nil && !isMissingProxmoxVMError(err) {
		return err
	}
	return nil
}

func isMissingProxmoxVMError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "does not exist") ||
		strings.Contains(message, "not found") ||
		strings.Contains(message, "no such vm")
}

func (h *PodsHandler) visibleCatalogPodBySlug(
	ctx context.Context,
	principalID uuid.UUID,
	rawSlug string,
) (publishedPodBase, *requestError) {
	slug := strings.TrimSpace(rawSlug)
	if slug == "" {
		return publishedPodBase{}, &requestError{Status: http.StatusBadRequest, UserMessage: "invalid slug"}
	}

	q := database.New(h.DB)
	isProtected, err := h.Authz.HasProtectedAccess(ctx, principalID)
	if err != nil {
		return publishedPodBase{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize published pod catalog item",
			Err:         err,
		}
	}

	if isProtected {
		rows, err := q.ListPublishedPods(ctx)
		if err != nil {
			return publishedPodBase{}, &requestError{
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
		return publishedPodBase{}, &requestError{Status: http.StatusNotFound, UserMessage: "pod not found"}
	}

	row, err := q.GetVisiblePublishedPodBySlug(ctx, database.GetVisiblePublishedPodBySlugParams{
		Slug:        slug,
		PrincipalID: principalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return publishedPodBase{}, &requestError{Status: http.StatusNotFound, UserMessage: "pod not found"}
	}
	if err != nil {
		return publishedPodBase{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod",
			Operation:   "get visible published pod by slug for clone",
			Err:         err,
		}
	}

	return visiblePublishedSlugRowToBase(row), nil
}

func (h *PodsHandler) clonePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	username string,
	pod publishedPodBase,
	progress *clonePodProgressReporter,
) (database.ClonedPods, *requestError) {
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

	folderName, err := cloneFolderName(username)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
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

	if err := h.Service.EnsureFolderHasVMCapacity(ctx, targetFolderID, int32(len(publishedVMs))); err != nil {
		h.cleanupFailedUserClone(targetFolderID, nil)
		return database.ClonedPods{}, inventoryRequestError(err)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, targetFolderID)
	if err != nil {
		h.cleanupFailedUserClone(targetFolderID, nil)
		return database.ClonedPods{}, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		h.cleanupFailedUserClone(targetFolderID, nil)
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve cloned pod target node",
			Err:         err,
		}
	}

	progress.set(cloneProgressStepCloning, "Cloning Pod Template VMs into Cloned Pod VMs.")
	results, created, reqErr := h.clonePublishedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, progress)
	if reqErr != nil {
		h.cleanupFailedUserClone(targetFolderID, created)
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepWaiting, "Waiting for Cloned Pod VMs to be ready.")
	if reqErr := h.waitForClonedVMsVisible(ctx, results); reqErr != nil {
		h.cleanupFailedUserClone(targetFolderID, created)
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepRouter, "Configuring router.")
	if reqErr := h.configureClonedRouter(ctx, results); reqErr != nil {
		h.cleanupFailedUserClone(targetFolderID, created)
		return database.ClonedPods{}, reqErr
	}

	clone, reqErr := h.recordClonedPod(ctx, principalID, pod.ID, targetFolderID, results)
	if reqErr != nil {
		h.cleanupFailedUserClone(targetFolderID, created)
		return database.ClonedPods{}, reqErr
	}

	return clone, nil
}

func (h *PodsHandler) reclonePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	clone database.ClonedPods,
	progress *clonePodProgressReporter,
) (database.ClonedPods, *requestError) {
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

	progress.set(cloneProgressStepCloning, "Deleting existing Cloned Pod VMs.")
	if reqErr := h.deleteExistingClonedPodVMs(ctx, q, clone.ID); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if err := h.Service.EnsureFolderHasVMCapacity(ctx, clone.FolderID, int32(len(publishedVMs))); err != nil {
		return database.ClonedPods{}, inventoryRequestError(err)
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

	progress.set(cloneProgressStepCloning, "Cloning Pod Template VMs into fresh Cloned Pod VMs.")
	results, created, reqErr := h.clonePublishedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, progress)
	if reqErr != nil {
		h.cleanupFailedUserClone(uuid.Nil, created)
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepWaiting, "Waiting for fresh Cloned Pod VMs to be ready.")
	if reqErr := h.waitForClonedVMsVisible(ctx, results); reqErr != nil {
		h.cleanupFailedUserClone(uuid.Nil, created)
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepRouter, "Configuring router.")
	if reqErr := h.configureClonedRouter(ctx, results); reqErr != nil {
		h.cleanupFailedUserClone(uuid.Nil, created)
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.recordReclonedPodVMs(ctx, clone.ID, results); reqErr != nil {
		h.cleanupFailedUserClone(uuid.Nil, created)
		return database.ClonedPods{}, reqErr
	}

	return clone, nil
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

func (h *PodsHandler) clonePublishedPodVMs(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	publishedVMs []database.ListPublishedPodVMsForCloneRow,
	progress *clonePodProgressReporter,
) ([]clonePublishedVMResult, map[int]clonedVM, *requestError) {
	results := make([]clonePublishedVMResult, len(publishedVMs))
	created := make(map[int]clonedVM, len(publishedVMs))
	var createdMu sync.Mutex
	var allocate sync.Mutex

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)

	for index, publishedVM := range publishedVMs {
		index, publishedVM := index, publishedVM
		group.Go(func() error {
			progress.set(cloneProgressStepCloning, "Cloning "+publishedVM.Name+" into a Cloned Pod VM")
			source, reqErr := h.resolvePublishedPodVMTemplate(gctx, publishedVM.SourceInventoryItemID)
			if reqErr != nil {
				return reqErr
			}

			clone, reqErr := h.cloneVerifiedVMIntoFolder(
				gctx,
				source,
				publishedVM.SourceInventoryItemID,
				placement,
				targetNode,
				publishedVM.Name,
				false,
				cloneVMOptions{
					allocate: &allocate,
					onStarted: func(node string, vmid int) {
						createdMu.Lock()
						created[vmid] = clonedVM{TargetNode: node, VMID: vmid}
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
			results[index] = clonePublishedVMResult{published: publishedVM, clone: clone}
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

	identity, err := h.PX.GetVMIdentity(ctx, record.Node, int(record.Vmid))
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

func (h *PodsHandler) waitForClonedVMsVisible(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	wanted := make(map[int]struct{}, len(results))
	for _, result := range results {
		wanted[result.clone.VMID] = struct{}{}
	}

	check := func() (bool, error) {
		vms, err := h.PX.GetVMs(ctx)
		if err != nil {
			return false, err
		}
		found := make(map[int]struct{}, len(wanted))
		for _, vm := range vms {
			if _, ok := wanted[vm.VMID]; ok {
				found[vm.VMID] = struct{}{}
			}
		}
		return len(found) == len(wanted), nil
	}

	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		ready, err := check()
		if err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to detect cloned VMs",
				Operation:   "detect cloned VMs in Proxmox",
				Err:         err,
			}
		}
		if ready {
			return nil
		}

		select {
		case <-ctx.Done():
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "clone canceled while waiting for VMs",
				Operation:   "wait for cloned VMs",
				Err:         ctx.Err(),
			}
		case <-deadline:
			return &requestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned VMs were not detected in Proxmox",
			}
		case <-ticker.C:
		}
	}
}

func (h *PodsHandler) configureClonedRouter(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	var router *clonedVM
	for _, result := range results {
		if strings.EqualFold(result.published.Name, "router") {
			clone := result.clone
			router = &clone
			break
		}
	}
	if router == nil {
		return nil
	}

	status, err := h.getVMStatus(ctx, router.VMID)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to detect router status",
			Operation:   "detect cloned router status",
			Err:         err,
		}
	}
	if status != "running" {
		if err := h.PX.StartVM(ctx, router.TargetNode, router.VMID); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to start router",
				Operation:   "start cloned router",
				Err:         err,
			}
		}
	}
	if err := h.waitForVMStatus(ctx, router.VMID, "running"); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router did not reach running state",
			Operation:   "wait for cloned router running",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) recordClonedPod(
	ctx context.Context,
	principalID uuid.UUID,
	podID uuid.UUID,
	folderID uuid.UUID,
	results []clonePublishedVMResult,
) (database.ClonedPods, *requestError) {
	taskRows, questionCounts, reqErr := h.cloneTaskQuestionCounts(ctx, podID)
	if reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod",
			Operation:   "begin cloned pod tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	clone, err := q.InsertClonedPod(ctx, database.InsertClonedPodParams{
		ID:              uuid.New(),
		PodID:           podID,
		UserPrincipalID: principalID,
		FolderID:        folderID,
	})
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod",
			Operation:   "insert cloned pod",
			Err:         err,
		}
	}

	for _, result := range results {
		if err := q.InsertClonedPodVM(ctx, database.InsertClonedPodVMParams{
			ClonedPodID:      clone.ID,
			PublishedPodVmID: result.published.ID,
			InventoryItemID:  result.clone.InventoryItemID,
			SortOrder:        result.published.SortOrder,
		}); err != nil {
			return database.ClonedPods{}, &requestError{
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
			return database.ClonedPods{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to record cloned pod task progress",
				Operation:   "insert cloned pod task state",
				Err:         err,
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod",
			Operation:   "commit cloned pod tx",
			Err:         err,
		}
	}

	return clone, nil
}

func (h *PodsHandler) recordReclonedPodVMs(
	ctx context.Context,
	cloneID uuid.UUID,
	results []clonePublishedVMResult,
) *requestError {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod VMs",
			Operation:   "begin recloned pod tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if err := q.DeleteClonedPodVMs(ctx, cloneID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace cloned pod VMs",
			Operation:   "delete cloned pod VM records",
			Err:         err,
		}
	}

	for _, result := range results {
		if err := q.InsertClonedPodVM(ctx, database.InsertClonedPodVMParams{
			ClonedPodID:      cloneID,
			PublishedPodVmID: result.published.ID,
			InventoryItemID:  result.clone.InventoryItemID,
			SortOrder:        result.published.SortOrder,
		}); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to record cloned pod VMs",
				Operation:   "insert recloned pod VM",
				Err:         err,
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod VMs",
			Operation:   "commit recloned pod tx",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) cloneTaskQuestionCounts(
	ctx context.Context,
	podID uuid.UUID,
) ([]database.ListPublishedPodTasksByPodIDsRow, map[uuid.UUID]int, *requestError) {
	q := database.New(h.DB)
	tasks, err := q.ListPublishedPodTasksByPodIDs(ctx, []uuid.UUID{podID})
	if err != nil {
		return nil, nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod tasks",
			Operation:   "load published pod tasks for clone",
			Err:         err,
		}
	}

	taskIDs := make([]uuid.UUID, 0, len(tasks))
	for _, task := range tasks {
		taskIDs = append(taskIDs, task.ID)
	}

	counts := make(map[uuid.UUID]int, len(tasks))
	if len(taskIDs) == 0 {
		return tasks, counts, nil
	}

	questions, err := q.ListPublishedPodQuestionsByTaskIDs(ctx, taskIDs)
	if err != nil {
		return nil, nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod questions",
			Operation:   "load published pod questions for clone",
			Err:         err,
		}
	}
	for _, question := range questions {
		counts[question.TaskID]++
	}

	return tasks, counts, nil
}

func (h *PodsHandler) hydrateClonedPod(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	clone database.ClonedPods,
) (clonedPodResponse, error) {
	vms, err := h.hydrateClonedPodVMs(ctx, q, principalID, clone.ID)
	if err != nil {
		return clonedPodResponse{}, err
	}
	status, err := h.hydrateClonedPodRuntimeStatus(ctx, q, clone.ID)
	if err != nil {
		return clonedPodResponse{}, err
	}

	taskRows, err := q.ListPublishedPodTasksByPodIDs(ctx, []uuid.UUID{clone.PodID})
	if err != nil {
		return clonedPodResponse{}, err
	}
	taskStates, err := q.ListClonedPodTaskStates(ctx, clone.ID)
	if err != nil {
		return clonedPodResponse{}, err
	}
	answers, err := q.ListClonedPodQuestionAnswers(ctx, clone.ID)
	if err != nil {
		return clonedPodResponse{}, err
	}

	taskStateResponses := make([]clonedPodTaskStateResponse, 0, len(taskStates))
	completedTasks := 0
	for _, row := range taskStates {
		if row.Completed {
			completedTasks++
		}
		taskStateResponses = append(taskStateResponses, clonedPodTaskStateResponse{
			TaskID:      row.TaskID,
			Completed:   row.Completed,
			CompletedAt: optionalTime(row.CompletedAt),
		})
	}

	totalTasks := len(taskRows)
	progress := 0.0
	if totalTasks > 0 {
		progress = (float64(completedTasks) / float64(totalTasks)) * 100
	}

	answerResponses := make([]clonedPodQuestionAnswerResponse, 0, len(answers))
	for _, row := range answers {
		answerResponses = append(answerResponses, clonedPodQuestionAnswerResponse{
			QuestionID: row.QuestionID,
			Answer:     row.Answer,
			IsCorrect:  row.IsCorrect,
			AnsweredAt: pgTime(row.AnsweredAt),
		})
	}

	return clonedPodResponse{
		ID:       clone.ID,
		PodID:    clone.PodID,
		ClonedAt: pgTime(clone.CreatedAt),
		Status:   status,
		VMs:      vms,
		TaskSummary: clonedPodTaskSummaryResponse{
			Total:     totalTasks,
			Completed: completedTasks,
			Progress:  progress,
		},
		TaskStates:      taskStateResponses,
		QuestionAnswers: answerResponses,
	}, nil
}

func (h *PodsHandler) hydrateClonedPodVMs(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
) ([]clonedPodVMResponse, error) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return nil, err
	}
	visibleItemIDs, err := h.visibleInventoryItemIDs(ctx, principalID)
	if err != nil {
		return nil, err
	}
	rows = filterVisibleClonedPodVMRows(rows, visibleItemIDs)

	vmids := make([]int, 0, len(rows))
	for _, row := range rows {
		if row.Vmid != nil {
			vmids = append(vmids, int(*row.Vmid))
		}
	}
	statuses, resources, err := h.runtimeForVMIDs(ctx, vmids)
	if err != nil {
		return nil, err
	}

	response := make([]clonedPodVMResponse, 0, len(rows))
	for _, row := range rows {
		vmid := int32(0)
		if row.Vmid != nil {
			vmid = *row.Vmid
		}
		status := "missing"
		resource := vmstatus.VMResources{}
		var uptime *int64
		if vmid > 0 {
			if value, ok := statuses[int(vmid)]; ok {
				status = value
			}
			if value, ok := resources[int(vmid)]; ok {
				resource = value
				uptimeValue := value.Uptime
				uptime = &uptimeValue
			}
		}

		response = append(response, clonedPodVMResponse{
			ID:        row.InventoryItemID,
			Name:      row.Name,
			Status:    status,
			Resources: resource,
			Uptime:    uptime,
			Inventory: clonedPodVMInventoryResponse{
				ItemID: row.InventoryItemID,
			},
		})
	}

	return response, nil
}

func (h *PodsHandler) visibleInventoryItemIDs(
	ctx context.Context,
	principalID uuid.UUID,
) (map[uuid.UUID]struct{}, error) {
	rows, err := h.Service.GetVisibleInventoryItems(ctx, principalID)
	if err != nil {
		return nil, err
	}

	ids := make(map[uuid.UUID]struct{}, len(rows))
	for _, row := range rows {
		ids[row.ID] = struct{}{}
	}

	return ids, nil
}

func filterVisibleClonedPodVMRows(
	rows []database.ListClonedPodVMsRow,
	visibleItemIDs map[uuid.UUID]struct{},
) []database.ListClonedPodVMsRow {
	filtered := make([]database.ListClonedPodVMsRow, 0, len(rows))
	for _, row := range rows {
		if _, ok := visibleItemIDs[row.InventoryItemID]; ok {
			filtered = append(filtered, row)
		}
	}
	return filtered
}

func (h *PodsHandler) hydrateClonedPodRuntimeStatus(
	ctx context.Context,
	q *database.Queries,
	cloneID uuid.UUID,
) (string, error) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return "", err
	}

	vmids := make([]int, 0, len(rows))
	for _, row := range rows {
		if row.Vmid != nil {
			vmids = append(vmids, int(*row.Vmid))
		}
	}
	statuses, _, err := h.runtimeForVMIDs(ctx, vmids)
	if err != nil {
		return "", err
	}

	vmStatuses := make([]string, 0, len(rows))
	for _, row := range rows {
		status := "missing"
		if row.Vmid != nil {
			if value, ok := statuses[int(*row.Vmid)]; ok {
				status = value
			}
		}
		vmStatuses = append(vmStatuses, status)
	}

	return clonedPodRuntimeStatus(vmStatuses), nil
}

func (h *PodsHandler) runtimeForVMIDs(
	ctx context.Context,
	vmids []int,
) (map[int]string, map[int]vmstatus.VMResources, error) {
	statuses := make(map[int]string, len(vmids))
	resources := make(map[int]vmstatus.VMResources, len(vmids))

	if h.Notifier != nil {
		current := h.Notifier.Current()
		for _, vmid := range vmids {
			if status, ok := current[vmid]; ok {
				statuses[vmid] = status
			}
			if resource, ok := h.Notifier.Resources(vmid); ok {
				resources[vmid] = resource
			}
		}
	}

	if len(statuses) == len(uniqueInts(vmids)) {
		return statuses, resources, nil
	}

	vms, err := h.PX.GetVMs(ctx)
	if err != nil {
		if h.Notifier != nil {
			return statuses, resources, nil
		}
		return nil, nil, err
	}
	for _, vm := range vms {
		statuses[vm.VMID] = vm.Status
		resources[vm.VMID] = vmResourcesFromProxmoxVM(vm)
	}

	return statuses, resources, nil
}

func (h *PodsHandler) getVMStatus(ctx context.Context, vmid int) (string, error) {
	statuses, _, err := h.runtimeForVMIDs(ctx, []int{vmid})
	if err != nil {
		return "", err
	}
	status, ok := statuses[vmid]
	if !ok {
		return "", fmt.Errorf("vm %d not found", vmid)
	}
	return status, nil
}

func (h *PodsHandler) waitForVMStatus(ctx context.Context, vmid int, expected string) error {
	if h.Notifier != nil {
		if err := h.Notifier.RefreshUntilStatus(ctx, vmid, expected); err == nil {
			return nil
		}
	}

	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		status, err := h.getVMStatus(ctx, vmid)
		if err != nil {
			return err
		}
		if status == expected {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline:
			return fmt.Errorf("vm %d did not reach %s", vmid, expected)
		case <-ticker.C:
		}
	}
}

func vmResourcesFromProxmoxVM(vm proxmox.VM) vmstatus.VMResources {
	return vmstatus.VMResources{
		CPU:       vm.CPU,
		MaxCPU:    vm.MaxCPU,
		Mem:       vm.Mem,
		MaxMem:    vm.MaxMem,
		Disk:      vm.Disk,
		MaxDisk:   vm.MaxDisk,
		NetIn:     vm.NetIn,
		NetOut:    vm.NetOut,
		DiskRead:  vm.DiskRead,
		DiskWrite: vm.DiskWrite,
		Uptime:    vm.Uptime,
	}
}

func clonedPodRuntimeStatus(statuses []string) string {
	if len(statuses) == 0 {
		return "partial"
	}

	allRunning := true
	allStopped := true
	for _, status := range statuses {
		allRunning = allRunning && status == "running"
		allStopped = allStopped && status == "stopped"
	}

	if allRunning {
		return "running"
	}
	if allStopped {
		return "stopped"
	}
	return "partial"
}

func (h *PodsHandler) cleanupFailedUserClone(folderID uuid.UUID, created map[int]clonedVM) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	for _, clone := range created {
		if err := h.deleteClonedPodProxmoxVM(ctx, clone.TargetNode, clone.VMID); err != nil {
			log.Printf("clone cleanup: failed to delete Proxmox VM %d on %s: %v", clone.VMID, clone.TargetNode, err)
		}
		if clone.InventoryItemID != uuid.Nil {
			if err := h.Service.DeleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
				log.Printf("clone cleanup: failed to delete inventory item %s: %v", clone.InventoryItemID, err)
			}
		}
	}

	if folderID != uuid.Nil {
		if err := h.Service.DeleteFolder(ctx, folderID); err != nil {
			log.Printf("clone cleanup: failed to delete target folder %s: %v", folderID, err)
		}
	}
}

func currentUsername(c *gin.Context) (string, bool) {
	value, ok := c.Get("username")
	if !ok {
		return "", false
	}
	username, ok := value.(string)
	username = strings.TrimSpace(username)
	return username, ok && username != ""
}

func cloneFolderName(username string) (string, error) {
	name := names.Normalize(username)
	if err := names.ValidateFolder(name); err == nil {
		return name, nil
	}

	var builder strings.Builder
	lastDash := false
	for _, r := range name {
		isAllowed := (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isAllowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if builder.Len() > 0 && !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}

	folderName := strings.Trim(builder.String(), "-")
	if folderName == "" {
		return "", fmt.Errorf("username cannot be used as a pod folder name")
	}
	if folderName[0] >= '0' && folderName[0] <= '9' {
		folderName = "User-" + folderName
	}
	if len(folderName) > 63 {
		folderName = strings.TrimRight(folderName[:63], "-")
	}
	if err := names.ValidateFolder(folderName); err != nil {
		return "", err
	}

	return folderName, nil
}

func answersMatch(answer, expected string) bool {
	return strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected))
}

func pgTime(value pgtype.Timestamptz) time.Time {
	if !value.Valid {
		return time.Time{}
	}
	return value.Time
}

func uniqueInts(values []int) map[int]struct{} {
	unique := make(map[int]struct{}, len(values))
	for _, value := range values {
		unique[value] = struct{}{}
	}
	return unique
}
