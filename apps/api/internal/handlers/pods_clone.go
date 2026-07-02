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
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
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

	routerCloudInitNetworkPlaceholder = "{network}"
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
	router    bool
}

type podNetworkVMTarget struct {
	name   string
	clone  clonedVM
	router bool
}

type clonedRouterCloudInitConfig struct {
	Storage     string
	UserFile    string
	NetworkFile string
}

type clonedPodResponse struct {
	ID              uuid.UUID                         `json:"id"`
	PodID           uuid.UUID                         `json:"pod_id"`
	Owner           publishedPodCloneOwnerResponse    `json:"owner"`
	ClonedAt        time.Time                         `json:"cloned_at"`
	Status          string                            `json:"status"`
	Network         clonedPodNetworkResponse          `json:"network"`
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

type podQuestionActivityResponse struct {
	PodID      uuid.UUID `json:"pod_id"`
	QuestionID uuid.UUID `json:"question_id"`
	AnsweredAt time.Time `json:"answered_at"`
}

type catalogCloneSummaryResponse struct {
	ID          uuid.UUID                       `json:"id"`
	PodID       uuid.UUID                       `json:"pod_id"`
	ClonedAt    time.Time                       `json:"cloned_at"`
	Status      string                          `json:"status"`
	TaskSummary catalogCloneTaskSummaryResponse `json:"task_summary"`
}

type catalogCloneTaskSummaryResponse struct {
	Total     int     `json:"total"`
	Completed int     `json:"completed"`
	Progress  float64 `json:"progress"`
}

type catalogClonePodResponse struct {
	ID          uuid.UUID `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	ImageURL    string    `json:"image_url"`
}

type catalogCloneSummaryResponseWithPod struct {
	Summary catalogCloneSummaryResponse `json:"summary"`
	Pod     catalogClonePodResponse     `json:"pod"`
}

type answerPodQuestionRequest struct {
	Answer string `json:"answer" binding:"required"`
}

type clonedPodPowerRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown"`
}

type publishedPodCloneBulkActionRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown reclone delete"`
}

type createPublishedPodCloneRequest struct {
	PrincipalID uuid.UUID `json:"principal_id" binding:"required"`
	ProgressID  string    `json:"progress_id"`
}

type publishedPodCloneBulkActionFailure struct {
	ID    uuid.UUID `json:"id"`
	Error string    `json:"error"`
}

type publishedPodCloneBulkActionResponse struct {
	Action    string                               `json:"action"`
	Succeeded []uuid.UUID                          `json:"succeeded"`
	Failed    []publishedPodCloneBulkActionFailure `json:"failed"`
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

func isPodRouterName(name string) bool {
	return strings.EqualFold(strings.TrimSpace(name), "router")
}

func isPublishedPodRouterVM(publishedVM database.ListPublishedPodVMsForCloneRow) bool {
	return isPodRouterName(publishedVM.Name)
}

func publishedPodVMTemplateItemID(name string, publishedTemplateID, routerTemplateID uuid.UUID) (uuid.UUID, error) {
	if !isPodRouterName(name) {
		return publishedTemplateID, nil
	}
	if routerTemplateID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("router template is not configured")
	}
	return routerTemplateID, nil
}

func podNetworkTargetsFromCloneResults(results []clonePublishedVMResult) []podNetworkVMTarget {
	targets := make([]podNetworkVMTarget, 0, len(results))
	for _, result := range results {
		targets = append(targets, podNetworkVMTarget{
			name:   result.published.Name,
			clone:  result.clone,
			router: result.router,
		})
	}
	return targets
}

func findPodNetworkRouterTarget(targets []podNetworkVMTarget) (*podNetworkVMTarget, *requestError) {
	var router *podNetworkVMTarget
	for index := range targets {
		if !targets[index].router {
			continue
		}
		if router != nil {
			return nil, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "pod must contain exactly one router virtual machine named router",
			}
		}
		router = &targets[index]
	}
	if router == nil {
		return nil, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "pod must contain exactly one router virtual machine named router",
		}
	}
	return router, nil
}

func formatClonedRouterCloudInitFile(pattern string, networkNumber int32) (string, error) {
	pattern = strings.TrimSpace(pattern)
	if strings.Count(pattern, routerCloudInitNetworkPlaceholder) != 1 {
		return "", fmt.Errorf("pattern must contain %s exactly once", routerCloudInitNetworkPlaceholder)
	}

	filename := strings.Replace(
		pattern,
		routerCloudInitNetworkPlaceholder,
		fmt.Sprintf("%d", networkNumber),
		1,
	)
	if err := routerconfig.ValidateCloudInitSnippetFilename(filename); err != nil {
		return "", err
	}

	return filename, nil
}

func buildClonedRouterCloudInitConfig(networkNumber int32, config PodRouterCloneConfig) (*clonedRouterCloudInitConfig, error) {
	storage := strings.TrimSpace(config.CloudInitStorage)
	if storage == "" {
		return nil, fmt.Errorf("router cloud-init storage is required")
	}

	userFile, err := formatClonedRouterCloudInitFile(config.CloudInitUserFilePattern, networkNumber)
	if err != nil {
		return nil, fmt.Errorf("build router cloud-init user-data filename: %w", err)
	}

	networkFile := strings.TrimSpace(config.CloudInitNetworkFile)
	if strings.Contains(networkFile, routerCloudInitNetworkPlaceholder) {
		return nil, fmt.Errorf("router cloud-init network-config filename must not contain %s", routerCloudInitNetworkPlaceholder)
	}
	if err := routerconfig.ValidateCloudInitSnippetFilename(networkFile); err != nil {
		return nil, fmt.Errorf("build router cloud-init network-config filename: %w", err)
	}

	return &clonedRouterCloudInitConfig{
		Storage:     storage,
		UserFile:    userFile,
		NetworkFile: networkFile,
	}, nil
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

	cloneByPodID := make(map[uuid.UUID]catalogCloneSummaryResponse, len(cloneRows))
	for _, row := range cloneRows {
		totalTasks := int(row.TaskTotal)
		completedTasks := int(row.TaskCompleted)
		progress := 0.0
		if totalTasks > 0 {
			progress = (float64(completedTasks) / float64(totalTasks)) * 100
		}

		status, err := h.hydrateClonedPodRuntimeStatus(c.Request.Context(), q, row.ID)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load clone runtime status", "hydrate clone runtime status for summary", err)
			return
		}

		cloneByPodID[row.PodID] = catalogCloneSummaryResponse{
			ID:       row.ID,
			PodID:    row.PodID,
			ClonedAt: pgTime(row.CreatedAt),
			Status:   status,
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	username, ok := currentUsername(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	cloneID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.power." + req.Action,
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
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
	clone, reqErr := h.loadClonedPodForMutation(c.Request.Context(), q, principalID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
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
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.delete",
		TargetKind:       "pod",
		PodID:            &clone.PodID,
		Metadata:         map[string]any{"clone_id": clone.ID.String()},
	})
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

	ctx := c.Request.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "begin cloned pod question answer tx", err)
		return
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	clone, reqErr := h.loadAccessibleClonedPod(ctx, q, principalID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	question, err := q.GetQuestionForClonedPod(ctx, database.GetQuestionForClonedPodParams{
		ClonedPodID: cloneID,
		QuestionID:  questionID,
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
	liveAnswer, err := q.UpsertClonedPodQuestionAnswer(ctx, database.UpsertClonedPodQuestionAnswerParams{
		ClonedPodID: cloneID,
		QuestionID:  question.ID,
		Answer:      answer,
		IsCorrect:   isCorrect,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert cloned pod question answer", err)
		return
	}

	if _, err := q.UpsertPrincipalPodQuestionAnswer(
		ctx,
		buildPrincipalPodQuestionAnswerParams(principalID, clone, question, liveAnswer),
	); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "upsert principal pod question answer", err)
		return
	}

	remaining, err := q.CountIncorrectOrUnansweredTaskQuestions(ctx, database.CountIncorrectOrUnansweredTaskQuestionsParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "count cloned pod task questions", err)
		return
	}
	if err := q.SetClonedPodTaskCompleted(ctx, database.SetClonedPodTaskCompletedParams{
		ClonedPodID: cloneID,
		TaskID:      question.TaskID,
		Completed:   remaining == 0,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update task progress", "set cloned pod task completion", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to save answer", "commit cloned pod question answer tx", err)
		return
	}

	q = database.New(h.DB)
	response, err := h.hydrateClonedPod(c.Request.Context(), q, principalID, clone)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod details", "hydrate cloned pod after answer", err)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *PodsHandler) ListPodQuestionActivity(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	q := database.New(h.DB)
	rows, err := q.ListPrincipalCorrectPodQuestionAnswers(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load question activity", "list principal correct pod question answers", err)
		return
	}

	response := make([]podQuestionActivityResponse, 0, len(rows))
	for _, row := range rows {
		response = append(response, podQuestionActivityResponse{
			PodID:      row.SourcePodID,
			QuestionID: row.SourceQuestionID,
			AnsweredAt: pgTime(row.AnsweredAt),
		})
	}

	c.JSON(http.StatusOK, response)
}

func buildPrincipalPodQuestionAnswerParams(
	principalID uuid.UUID,
	clone database.ClonedPods,
	question database.GetQuestionForClonedPodRow,
	answer database.UpsertClonedPodQuestionAnswerRow,
) database.UpsertPrincipalPodQuestionAnswerParams {
	return database.UpsertPrincipalPodQuestionAnswerParams{
		PrincipalID:      principalID,
		SourcePodID:      question.PodID,
		SourceTaskID:     question.TaskID,
		SourceQuestionID: question.ID,
		LastClonedPodID:  &clone.ID,
		PodSlug:          question.PodSlug,
		PodTitle:         question.PodTitle,
		TaskTitle:        question.TaskTitle,
		QuestionTitle:    question.Title,
		Answer:           answer.Answer,
		IsCorrect:        answer.IsCorrect,
		AnsweredAt:       answer.AnsweredAt,
	}
}

func (h *PodsHandler) loadAccessibleClonedPod(
	ctx context.Context,
	q *database.Queries,
	currentPrincipalID uuid.UUID,
	cloneID uuid.UUID,
) (database.ClonedPods, *requestError) {
	clone, err := q.GetAccessibleClonedPodByID(ctx, database.GetAccessibleClonedPodByIDParams{
		ID:          cloneID,
		PrincipalID: currentPrincipalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load accessible cloned pod",
			Err:         err,
		}
	}
	return clone, nil
}

func (h *PodsHandler) loadClonedPodForMutation(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
) (database.ClonedPods, *requestError) {
	isManager, err := h.Authz.IsManager(ctx, principalID)
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "authorization failed",
			Operation:   "authorize cloned pod mutation",
			Err:         err,
		}
	}

	clone, err := q.GetClonedPodByID(ctx, cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load cloned pod for mutation",
			Err:         err,
		}
	}

	if !cloneMutationAllowed(isManager, clone.UserPrincipalID, principalID) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}

	return clone, nil
}

func (h *PodsHandler) clonedPodActionTargets(
	ctx context.Context,
	q *database.Queries,
	principalID uuid.UUID,
	cloneID uuid.UUID,
	required authorization.Mask,
) (database.ClonedPods, []vmactions.Target, *requestError) {
	clone, reqErr := h.loadAccessibleClonedPod(ctx, q, principalID, cloneID)
	if reqErr != nil {
		return database.ClonedPods{}, nil, reqErr
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

func cloneMutationAllowed(isManager bool, ownerPrincipalID, actorPrincipalID uuid.UUID) bool {
	return isManager || ownerPrincipalID == actorPrincipalID
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

	var created map[int]clonedVM
	provisioned := false
	defer func() {
		if !provisioned {
			h.cleanupFailedUserClone(targetFolderID, created)
		}
	}()

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

	clone, reqErr := h.createClonedPodRecord(ctx, principalID, pod.ID, targetFolderID)
	if reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	if reqErr := h.ensureClonedPodVNetExists(ctx, h.clonedPodVNetName(clone.NetworkNumber)); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	results, created, reqErr := h.provisionClonedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, clone, progress)
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

	if reqErr := h.ensureClonedPodVNetExists(ctx, h.clonedPodVNetName(clone.NetworkNumber)); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	progress.set(cloneProgressStepCloning, "Deleting existing cloned pod virtual machines.")
	if reqErr := h.deleteExistingClonedPodVMs(ctx, q, clone.ID); reqErr != nil {
		return database.ClonedPods{}, reqErr
	}

	var created map[int]clonedVM
	provisioned := false
	defer func() {
		if !provisioned {
			h.cleanupFailedUserClone(uuid.Nil, created)
		}
	}()

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

	results, created, reqErr := h.provisionClonedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, clone, progress)
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
	progress *clonePodProgressReporter,
) ([]clonePublishedVMResult, map[int]clonedVM, *requestError) {
	progress.set(cloneProgressStepCloning, "Cloning virtual machines.")
	results, created, reqErr := h.clonePublishedPodVMs(ctx, principalID, placement, targetNode, publishedVMs, progress)
	if reqErr != nil {
		return nil, created, reqErr
	}

	progress.set(cloneProgressStepWaiting, "Preparing virtual machines.")
	if reqErr := h.waitForClonedVMsReady(ctx, results); reqErr != nil {
		return nil, created, reqErr
	}
	if reqErr := h.configureClonedPodNetwork(ctx, clone.NetworkNumber, results); reqErr != nil {
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
			router := isPublishedPodRouterVM(publishedVM)
			sourceItemID, err := publishedPodVMTemplateItemID(
				publishedVM.Name,
				publishedVM.SourceInventoryItemID,
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

func (h *PodsHandler) createClonedPodRecord(
	ctx context.Context,
	principalID uuid.UUID,
	podID uuid.UUID,
	folderID uuid.UUID,
) (database.ClonedPods, *requestError) {
	q := database.New(h.DB)
	clone, err := q.InsertClonedPod(ctx, database.InsertClonedPodParams{
		ID:               uuid.New(),
		PodID:            podID,
		UserPrincipalID:  principalID,
		FolderID:         folderID,
		MinNetworkNumber: h.RouterCloneConfig.NetworkMin,
		MaxNetworkNumber: h.RouterCloneConfig.NetworkMax,
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
	return clone, nil
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

func (h *PodsHandler) podVNetName(networkNumber int32) string {
	return fmt.Sprintf("%s%d", strings.TrimSpace(h.RouterCloneConfig.VNetPrefix), networkNumber)
}

func (h *PodsHandler) clonedPodVNetName(networkNumber int32) string {
	return h.podVNetName(networkNumber)
}

func (h *PodsHandler) podNetworkMetadata(networkNumber int32) (clonedPodNetworkResponse, error) {
	wanBase, err := routerconfig.NormalizeDottedPrefix(h.RouterCloneConfig.WANIPBase)
	if err != nil {
		return clonedPodNetworkResponse{}, fmt.Errorf("invalid WAN IP base %q: %w", h.RouterCloneConfig.WANIPBase, err)
	}

	return clonedPodNetworkResponse{
		Number:          networkNumber,
		VNet:            h.podVNetName(networkNumber),
		ExternalSubnet:  fmt.Sprintf("%s%d.0/24", wanBase, networkNumber),
		ExternalGateway: fmt.Sprintf("%s%d.1", wanBase, networkNumber),
		InternalSubnet:  h.RouterCloneConfig.InternalSubnet.String(),
		InternalGateway: h.RouterCloneConfig.InternalSubnet.Addr().Next().String(),
	}, nil
}

func (h *PodsHandler) clonedPodNetworkMetadata(networkNumber int32) (clonedPodNetworkResponse, error) {
	return h.podNetworkMetadata(networkNumber)
}

func (h *PodsHandler) ensurePodVNetExists(ctx context.Context, vnetName string) *requestError {
	vnets, err := h.PX.GetVNets(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load pod clone networks",
			Operation:   "list pod clone VNets",
			Err:         err,
		}
	}

	for _, vnet := range vnets {
		if vnet.VNet == vnetName {
			return nil
		}
	}

	return &requestError{
		Status:      http.StatusBadGateway,
		UserMessage: "allocated pod clone network is not available in Proxmox",
	}
}

func (h *PodsHandler) ensureClonedPodVNetExists(ctx context.Context, vnetName string) *requestError {
	return h.ensurePodVNetExists(ctx, vnetName)
}

func (h *PodsHandler) waitForPodVMTargetsVisible(
	ctx context.Context,
	targets []podNetworkVMTarget,
) *requestError {
	wanted := make(map[int]struct{}, len(targets))
	for _, target := range targets {
		wanted[target.clone.VMID] = struct{}{}
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

func (h *PodsHandler) waitForClonedVMsVisible(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	return h.waitForPodVMTargetsVisible(ctx, podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) waitForPodVMTargetsReady(
	ctx context.Context,
	targets []podNetworkVMTarget,
) *requestError {
	if reqErr := h.waitForPodVMTargetsVisible(ctx, targets); reqErr != nil {
		return reqErr
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)
	for _, target := range targets {
		group.Go(func() error {
			if err := h.PX.WaitForVMConfigUnlocked(gctx, target.clone.TargetNode, target.clone.VMID, h.RouterCloneConfig.RouterWaitTimeout); err != nil {
				return fmt.Errorf("wait for VM %d config unlock: %w", target.clone.VMID, err)
			}
			if err := h.PX.WaitForVMStorageReady(gctx, target.clone.TargetNode, target.clone.VMID, h.RouterCloneConfig.RouterWaitTimeout); err != nil {
				return fmt.Errorf("wait for VM %d storage readiness: %w", target.clone.VMID, err)
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "cloned virtual machines were not ready",
			Operation:   "wait for cloned pod VM readiness",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) waitForClonedVMsReady(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	return h.waitForPodVMTargetsReady(ctx, podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) configurePodVNetBridges(
	ctx context.Context,
	vnetName string,
	targets []podNetworkVMTarget,
) *requestError {
	router, reqErr := findPodNetworkRouterTarget(targets)
	if reqErr != nil {
		return reqErr
	}

	if reqErr := h.ensurePodVNetExists(ctx, vnetName); reqErr != nil {
		return reqErr
	}

	if err := h.PX.SetVMNetworkBridge(ctx, router.clone.TargetNode, router.clone.VMID, "net1", vnetName); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned router network",
			Operation:   "set cloned router VNet bridge",
			Err:         err,
		}
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)
	for _, target := range targets {
		if target.router {
			continue
		}
		target := target
		group.Go(func() error {
			return h.PX.SetVMNetworkBridge(gctx, target.clone.TargetNode, target.clone.VMID, "net0", vnetName)
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned pod networks",
			Operation:   "set cloned pod VNet bridges",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) configureClonedPodNetwork(
	ctx context.Context,
	networkNumber int32,
	results []clonePublishedVMResult,
) *requestError {
	return h.configurePodVNetBridges(ctx, h.podVNetName(networkNumber), podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) configurePodRouterCloudInit(
	ctx context.Context,
	cloudInitConfig *clonedRouterCloudInitConfig,
	targets []podNetworkVMTarget,
) *requestError {
	router, reqErr := findPodNetworkRouterTarget(targets)
	if reqErr != nil {
		return reqErr
	}

	status, err := h.PX.GetVMRuntimeStatus(ctx, router.clone.TargetNode, router.clone.VMID)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to detect router status",
			Operation:   "detect cloned router runtime status",
			Err:         err,
		}
	}
	if status == "running" {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router must be stopped before cloud-init configuration",
			Operation:   "verify cloned router stopped",
			Err:         fmt.Errorf("cloned router VM %d is already running", router.clone.VMID),
		}
	}
	if status != "stopped" {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router must be stopped before cloud-init configuration",
			Operation:   "verify cloned router stopped",
			Err:         fmt.Errorf("cloned router VM %d is in %q state", router.clone.VMID, status),
		}
	}

	if err := h.PX.EnsureVMCloudInitDrive(ctx, router.clone.TargetNode, router.clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router template is missing a cloud-init drive",
			Operation:   "verify cloned router cloud-init drive",
			Err:         err,
		}
	}
	if err := h.PX.SetVMCloudInitCustom(
		ctx,
		router.clone.TargetNode,
		router.clone.VMID,
		cloudInitConfig.Storage,
		cloudInitConfig.UserFile,
		cloudInitConfig.NetworkFile,
	); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure router cloud-init snippets",
			Operation:   "set cloned router cloud-init custom config",
			Err:         err,
		}
	}

	if err := h.PX.StartVM(ctx, router.clone.TargetNode, router.clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to start router",
			Operation:   "start cloned router",
			Err:         err,
		}
	}
	if err := h.PX.WaitForVMRuntimeStatus(
		ctx,
		router.clone.TargetNode,
		router.clone.VMID,
		"running",
		h.RouterCloneConfig.RouterWaitTimeout,
	); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router did not reach running state",
			Operation:   "wait for cloned router runtime running",
			Err:         err,
		}
	}

	if h.Notifier != nil {
		if err := h.Notifier.RefreshNow(ctx); err != nil {
			log.Printf("clone router: status refresh after router start failed: %v", err)
		}
	}

	return nil
}

func (h *PodsHandler) configureClonedRouter(
	ctx context.Context,
	clone database.ClonedPods,
	results []clonePublishedVMResult,
) *requestError {
	cloudInitConfig, err := buildClonedRouterCloudInitConfig(clone.NetworkNumber, h.RouterCloneConfig)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to build router cloud-init configuration",
			Operation:   "build cloned router cloud-init configuration",
			Err:         err,
		}
	}

	return h.configurePodRouterCloudInit(ctx, cloudInitConfig, podNetworkTargetsFromCloneResults(results))
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

	principals, err := q.ListPrincipalDetailsByIDs(ctx, []uuid.UUID{clone.UserPrincipalID})
	if err != nil {
		return clonedPodResponse{}, err
	}
	if len(principals) == 0 {
		return clonedPodResponse{}, fmt.Errorf("clone owner principal not found")
	}
	owner := cloneOwnerFromPrincipal(principals[0])

	network, err := h.clonedPodNetworkMetadata(clone.NetworkNumber)
	if err != nil {
		return clonedPodResponse{}, err
	}

	return clonedPodResponse{
		ID:       clone.ID,
		PodID:    clone.PodID,
		Owner:    owner,
		ClonedAt: pgTime(clone.CreatedAt),
		Status:   status,
		Network:  network,
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
			status = h.runtimeStatusForClonedVMRow(ctx, row, statuses)
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

func (h *PodsHandler) runtimeStatusForClonedVMRow(
	ctx context.Context,
	row database.ListClonedPodVMsRow,
	statuses map[int]string,
) string {
	if row.Vmid == nil {
		return "missing"
	}

	vmid := int(*row.Vmid)
	status := "missing"
	if value, ok := statuses[vmid]; ok {
		status = strings.ToLower(strings.TrimSpace(value))
	}

	if status != "" && status != "unknown" && status != "missing" {
		return status
	}
	if row.Node == nil || strings.TrimSpace(*row.Node) == "" || h.PX == nil {
		if status == "" {
			return "missing"
		}
		return status
	}

	directStatus, err := h.PX.GetVMRuntimeStatus(ctx, strings.TrimSpace(*row.Node), vmid)
	if err != nil {
		if status == "" {
			return "missing"
		}
		return status
	}
	return directStatus
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
		vmStatuses = append(vmStatuses, h.runtimeStatusForClonedVMRow(ctx, row, statuses))
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

func (h *PodsHandler) cleanupFailedPodProvision(folderID uuid.UUID, created map[int]clonedVM) {
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

func (h *PodsHandler) cleanupFailedUserClone(folderID uuid.UUID, created map[int]clonedVM) {
	h.cleanupFailedPodProvision(folderID, created)
}

func (h *PodsHandler) PowerPublishedPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}
	if h.Actions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm actions unavailable"})
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid clone id"})
		return
	}

	var req clonedPodPowerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodByID(c.Request.Context(), cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for manager power", err)
		return
	}
	if clone.PodID != podID {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}

	targets, reqErr := h.clonedPodManagerActionTargets(c.Request.Context(), q, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	statuses, _, err := h.runtimeForVMIDs(c.Request.Context(), vmidsFromTargets(targets))
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to load VM statuses", "load cloned pod vm statuses for manager power", err)
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
			writeLoggedError(c, http.StatusBadGateway, "failed to update cloned pod power state", "manager power cloned pod vm", err)
			return
		}
		if err := h.waitForVMStatus(c.Request.Context(), target.VMID, expectedStatus); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to confirm cloned pod power state", "wait for manager cloned pod vm power state", err)
			return
		}
	}

	clones, err := h.hydratePublishedPodClones(c.Request.Context(), q, podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to reload cloned pods", "hydrate published pod clones after manager power", err)
		return
	}

	for _, resp := range clones {
		if resp.ID == cloneID {
			c.JSON(http.StatusOK, resp)
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{})
}

func (h *PodsHandler) DeletePublishedPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid clone id"})
		return
	}

	q := database.New(h.DB)
	clone, err := q.GetClonedPodByID(c.Request.Context(), cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod", "load cloned pod for manager delete", err)
		return
	}
	if clone.PodID != podID {
		c.JSON(http.StatusNotFound, gin.H{"error": "cloned pod not found"})
		return
	}

	rows, err := q.ListClonedPodVMs(c.Request.Context(), cloneID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load cloned pod virtual machines", "list cloned pod VMs for manager delete", err)
		return
	}

	for _, row := range rows {
		if row.Node == nil || row.Vmid == nil {
			continue
		}
		if err := h.deleteClonedPodProxmoxVM(c.Request.Context(), *row.Node, int(*row.Vmid)); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to delete cloned pod virtual machine", "manager delete cloned pod VM", err)
			return
		}
	}

	if err := h.Service.DeleteFolder(c.Request.Context(), clone.FolderID); err != nil {
		writeInventoryError(c, err)
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
) ([]vmactions.Target, *requestError) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return nil, &requestError{
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
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned pod VM is missing from inventory",
			}
		default:
			return nil, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to verify cloned pod VM",
				Operation:   "load cloned pod VM record for manager action",
				Err:         err,
			}
		}

		identity, err := h.PX.GetVMIdentity(ctx, record.Node, int(record.Vmid))
		switch {
		case err == nil:
		case errors.Is(err, proxmox.ErrVMIdentityNotConfigured), errors.Is(err, proxmox.ErrVMIdentityInvalid):
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned pod VM identity is not initialized in Proxmox",
			}
		default:
			return nil, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to verify cloned pod VM",
				Operation:   "verify cloned pod VM identity for manager action",
				Err:         err,
			}
		}

		if identity.UpstreamUUID != record.UpstreamUUID {
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned pod VM has drifted from inventory",
			}
		}

		targets = append(targets, vmactions.Target{
			ItemID: record.InventoryItemID,
			Node:   record.Node,
			VMID:   int(record.Vmid),
		})
	}

	if len(targets) == 0 {
		return nil, &requestError{
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
) (database.ClonedPods, *requestError) {
	clone, err := q.GetClonedPodByID(ctx, cloneID)
	if errors.Is(err, pgx.ErrNoRows) {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "cloned pod not found",
		}
	}
	if err != nil {
		return database.ClonedPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod",
			Operation:   "load cloned pod for manager action",
			Err:         err,
		}
	}
	if clone.PodID != podID {
		return database.ClonedPods{}, &requestError{
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
) *requestError {
	targets, reqErr := h.clonedPodManagerActionTargets(ctx, q, clone.ID)
	if reqErr != nil {
		return reqErr
	}

	statuses, _, err := h.runtimeForVMIDs(ctx, vmidsFromTargets(targets))
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load VM statuses",
			Operation:   "load cloned pod vm statuses for manager power",
			Err:         err,
		}
	}

	expectedStatus := "running"
	if action == string(vmactions.PowerActionShutdown) {
		expectedStatus = "stopped"
	}

	for _, target := range targets {
		if clonedPodVMAlreadyInPowerState(action, statuses[target.VMID]) {
			continue
		}
		if err := h.Actions.PowerAction(ctx, target, vmactions.PowerAction(action)); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to update cloned pod power state",
				Operation:   "manager power cloned pod vm",
				Err:         err,
			}
		}
		if err := h.waitForVMStatus(ctx, target.VMID, expectedStatus); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to confirm cloned pod power state",
				Operation:   "wait for manager cloned pod vm power state",
				Err:         err,
			}
		}
	}
	return nil
}

func (h *PodsHandler) deletePublishedPodCloneForManager(
	ctx context.Context,
	q *database.Queries,
	clone database.ClonedPods,
) *requestError {
	rows, err := q.ListClonedPodVMs(ctx, clone.ID)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load cloned pod virtual machines",
			Operation:   "list cloned pod VMs for manager delete",
			Err:         err,
		}
	}

	for _, row := range rows {
		if row.Node == nil || row.Vmid == nil {
			continue
		}
		if err := h.deleteClonedPodProxmoxVM(ctx, *row.Node, int(*row.Vmid)); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to delete cloned pod virtual machine",
				Operation:   "manager delete cloned pod VM",
				Err:         err,
			}
		}
	}

	if err := h.Service.DeleteFolder(ctx, clone.FolderID); err != nil {
		return inventoryRequestError(err)
	}
	return nil
}

func (h *PodsHandler) publishedPodCloneSummaryByID(
	ctx context.Context,
	q *database.Queries,
	podID uuid.UUID,
	cloneID uuid.UUID,
) (publishedPodCloneResponse, *requestError) {
	clones, err := h.hydratePublishedPodClones(ctx, q, podID)
	if err != nil {
		return publishedPodCloneResponse{}, &requestError{
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
	return publishedPodCloneResponse{}, &requestError{
		Status:      http.StatusNotFound,
		UserMessage: "cloned pod not found after action",
	}
}

func (h *PodsHandler) ReclonePublishedPodClone(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	cloneID, err := uuid.Parse(c.Param("cloneID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid clone id"})
		return
	}

	q := database.New(h.DB)
	clone, reqErr := h.loadPublishedPodCloneForManager(c.Request.Context(), q, podID, cloneID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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

	for _, clone := range clones {
		var reqErr *requestError
		switch req.Action {
		case "start", "shutdown":
			reqErr = h.powerPublishedPodCloneForManager(c.Request.Context(), q, clone, req.Action)
		case "reclone":
			_, reqErr = h.reclonePublishedPod(c.Request.Context(), clone.UserPrincipalID, clone, nil)
		case "delete":
			reqErr = h.deletePublishedPodCloneForManager(c.Request.Context(), q, clone)
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

	c.JSON(http.StatusOK, resp)
}

func (h *PodsHandler) CreatePublishedPodCloneForPrincipal(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	podID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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

	if target.PrincipalType == database.PrincipalTypeUser {
		if _, err := q.GetAccessibleClonedPodByPodID(c.Request.Context(), database.GetAccessibleClonedPodByPodIDParams{
			PodID:       pod.ID,
			PrincipalID: req.PrincipalID,
		}); err == nil {
			progress.fail("pod already cloned")
			writeRequestError(c, &requestError{Status: http.StatusConflict, UserMessage: "pod already cloned"})
			return
		} else if !errors.Is(err, pgx.ErrNoRows) {
			progress.fail("failed to check cloned pod")
			writeLoggedError(c, http.StatusInternalServerError, "failed to check cloned pod", "check accessible cloned pod for manager clone", err)
			return
		}
	}

	displayLabel := target.ExternalID
	if target.Name != nil && *target.Name != "" {
		displayLabel = *target.Name
	}

	folderName, err := managerCloneFolderName(req.PrincipalID, string(target.PrincipalType), displayLabel)
	if err != nil {
		progress.fail(err.Error())
		writeRequestError(c, &requestError{Status: http.StatusUnprocessableEntity, UserMessage: err.Error()})
		return
	}

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

func currentUsername(c *gin.Context) (string, bool) {
	value, ok := c.Get("username")
	if !ok {
		return "", false
	}
	username, ok := value.(string)
	username = strings.TrimSpace(username)
	return username, ok && username != ""
}

func cloneOwnerFromPrincipal(row database.ListPrincipalDetailsByIDsRow) publishedPodCloneOwnerResponse {
	label := row.ExternalID
	if row.Name != nil && strings.TrimSpace(*row.Name) != "" {
		label = *row.Name
	}
	description := row.ExternalID
	if row.Description != nil && strings.TrimSpace(*row.Description) != "" {
		description = *row.Description
	}
	return publishedPodCloneOwnerResponse{
		ID:          row.ID,
		Type:        string(row.PrincipalType),
		Label:       label,
		Description: description,
	}
}

func managerCloneFolderName(principalID uuid.UUID, principalType string, displayLabel string) (string, error) {
	const maxLen = 63

	if principalType == "group" || principalType == string(database.PrincipalTypeGroup) {
		name := sanitizeFolderNameString("Group-" + displayLabel)
		if name == "" {
			return "", fmt.Errorf("principal cannot be used as a pod folder name")
		}
		if len(name) > maxLen {
			return "", fmt.Errorf("principal cannot be used as a pod folder name")
		}
		if err := names.ValidateFolder(name); err != nil {
			return "", fmt.Errorf("principal cannot be used as a pod folder name")
		}
		return name, nil
	}

	suffix := principalID.String()[:8]
	prefix := strings.ToLower(principalType) + "-" + displayLabel + "-" + suffix
	name := sanitizeFolderNameString(prefix)
	if name == "" {
		return "", fmt.Errorf("principal cannot be used as a pod folder name")
	}
	if name[0] >= '0' && name[0] <= '9' {
		name = "p-" + name
	}
	if len(name) > maxLen {
		suffixWithDash := "-" + suffix
		if len(suffixWithDash) >= maxLen {
			return "", fmt.Errorf("principal cannot be used as a pod folder name")
		}
		truncated := name[:maxLen-len(suffixWithDash)]
		truncated = strings.TrimRight(truncated, "-")
		name = truncated + suffixWithDash
	}
	if err := names.ValidateFolder(name); err != nil {
		return "", fmt.Errorf("principal cannot be used as a pod folder name")
	}
	return name, nil
}

func sanitizeFolderNameString(input string) string {
	var builder strings.Builder
	lastDash := false
	for _, r := range input {
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
	return strings.Trim(builder.String(), "-")
}

func cloneFolderName(username string) (string, error) {
	name := names.Normalize(username)
	if len(name) > 0 && name[0] >= '0' && name[0] <= '9' {
		name = "User-" + name
	}
	if err := names.ValidateFolder(name); err == nil {
		return name, nil
	}

	folderName := sanitizeFolderNameString(name)
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
