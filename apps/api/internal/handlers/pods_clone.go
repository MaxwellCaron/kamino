package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	cloneProgressEventType    = "pod.clone.progress"
	cloneProgressStepFetching = 1
	cloneProgressStepCloning  = 2
	cloneProgressStepWaiting  = 3
	cloneProgressStepRouter   = 4

	routerCloudInitNetworkPlaceholder = "{network}"
)

var errPodCloneClaimsUnavailable = errors.New("pod clone claims unavailable")

// writePodCloneActionInProgress writes a deterministic 409 Conflict response
// when a pod clone claim is already held for the target pod/principal scope.
func writePodCloneActionInProgress(c *gin.Context) {
	writeConflict(c, "another operation is already in progress for this pod")
}

func (h *PodsHandler) acquirePodCloneClaim(
	c *gin.Context,
	podID uuid.UUID,
	userPrincipalID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
) bool {
	if h.PodCloneClaims == nil {
		writeLoggedError(c, http.StatusServiceUnavailable, "pod clone claims unavailable", "claim pod clone", errPodCloneClaimsUnavailable)
		return false
	}

	if err := h.PodCloneClaims.Claim(c.Request.Context(), podID, userPrincipalID, action, actorPrincipalID); err != nil {
		if vmactions.IsActionInProgress(err) {
			writePodCloneActionInProgress(c)
			return false
		}
		writeLoggedError(c, http.StatusInternalServerError, "failed to claim pod for mutation", "claim pod clone", err)
		return false
	}
	return true
}

func (h *PodsHandler) releasePodCloneClaim(podID, userPrincipalID uuid.UUID, requestCtx context.Context) {
	if h.PodCloneClaims == nil {
		return
	}
	_ = h.PodCloneClaims.Release(context.WithoutCancel(requestCtx), podID, userPrincipalID)
}

func (h *PodsHandler) claimPodCloneForMutation(
	ctx context.Context,
	podID uuid.UUID,
	userPrincipalID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
) *requestError {
	if h.PodCloneClaims == nil {
		return &requestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "pod clone claims unavailable",
			Operation:   "claim pod clone",
			Err:         errPodCloneClaimsUnavailable,
		}
	}
	if err := h.PodCloneClaims.Claim(ctx, podID, userPrincipalID, action, actorPrincipalID); err != nil {
		if vmactions.IsActionInProgress(err) {
			return &requestError{
				Status:      http.StatusConflict,
				UserMessage: "another operation is already in progress for this pod",
			}
		}
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to claim pod for mutation",
			Operation:   "claim pod clone",
			Err:         err,
		}
	}
	return nil
}

func (h *PodsHandler) runClaimedPodCloneMutation(
	ctx context.Context,
	clone database.ClonedPods,
	action string,
	actorPrincipalID uuid.UUID,
	fn func() *requestError,
) *requestError {
	if reqErr := h.claimPodCloneForMutation(ctx, clone.PodID, clone.UserPrincipalID, action, actorPrincipalID); reqErr != nil {
		return reqErr
	}
	defer h.releasePodCloneClaim(clone.PodID, clone.UserPrincipalID, ctx)
	return fn()
}

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
	return publishedVM.IsRouter
}

func publishedPodVMTemplateItemID(publishedVM database.ListPublishedPodVMsForCloneRow, routerTemplateID uuid.UUID) (uuid.UUID, error) {
	if !publishedVM.IsRouter {
		return publishedVM.SourceInventoryItemID, nil
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
