package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type publishPodVMOption struct {
	ID          uuid.UUID                      `json:"id"`
	Name        string                         `json:"name"`
	GuestType   string                         `json:"guest_type"`
	CPUCount    int32                          `json:"cpuCount"`
	MemoryGB    int32                          `json:"memoryGb"`
	StorageGB   int32                          `json:"storageGb"`
	IsRouter    bool                           `json:"is_router,omitempty"`
	SegmentKey  *string                        `json:"segment_key,omitempty"`
	Permissions publishedPodPermissionResponse `json:"permissions"`
}

type publishPodFolderOption struct {
	ID                uuid.UUID            `json:"id"`
	Name              string               `json:"name"`
	Path              string               `json:"path"`
	NetworkProfileKey string               `json:"network_profile_key"`
	VirtualMachines   []publishPodVMOption `json:"virtual_machines"`
}

type publishPodPrincipalRequest struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type publishPodPermissionRequest struct {
	AllowMask int64 `json:"allowMask"`
	DenyMask  int64 `json:"denyMask"`
}

type publishPodVMRequest struct {
	ID          string                      `json:"id"`
	Name        string                      `json:"name"`
	CPUCount    int32                       `json:"cpuCount"`
	MemoryGB    int32                       `json:"memoryGb"`
	StorageGB   int32                       `json:"storageGb"`
	IsRouter    bool                        `json:"is_router"`
	SegmentKey  *string                     `json:"segment_key"`
	Permissions publishPodPermissionRequest `json:"permissions"`
}

type publishPodQuestionRequest struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	AnswerOutline string  `json:"answerOutline"`
	Description   *string `json:"description"`
	Hint          *string `json:"hint"`
}

type publishPodTaskRequest struct {
	ID        string                      `json:"id"`
	Title     string                      `json:"title"`
	Content   string                      `json:"content"`
	Questions []publishPodQuestionRequest `json:"questions"`
}

type publishPodRequest struct {
	ID                    string                       `json:"id"`
	Title                 string                       `json:"title"`
	Description           string                       `json:"description"`
	Image                 string                       `json:"image"`
	Creators              []publishPodPrincipalRequest `json:"creators"`
	Status                string                       `json:"status"`
	Audience              []publishPodPrincipalRequest `json:"audience"`
	SourceFolder          string                       `json:"source_folder"`
	VirtualMachines       []publishPodVMRequest        `json:"virtual_machines"`
	UpdateVirtualMachines []string                     `json:"update_virtual_machines"`
	Tasks                 []publishPodTaskRequest      `json:"tasks"`
}

type updatePublishedPodStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

const defaultPublishedPodVMAllowMask = int64(
	authorization.View |
		authorization.ConsoleVM |
		authorization.PowerVM |
		authorization.ViewSnapshots |
		authorization.SnapshotVM,
)

func (h *PodsHandler) GetPublishOptions(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	publishedPodID := uuid.Nil
	if value := strings.TrimSpace(c.Query("published_pod_id")); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			writeInvalidRequest(c, "invalid published pod id")
			return
		}
		publishedPodID = parsed
	}

	podFolders, err := h.publishPodFolders(c.Request.Context(), principalID, publishedPodID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load Pod Folders", "load publish Pod Folders", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"source_folders": podFolders})
}

func (h *PodsHandler) SavePublished(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req publishPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	progress := newPublishPodProgressReporter(c.Query("progress_id"))
	progress.set(publishProgressStepValidating, "Checking the selected Pod Folder and Pod VMs.")

	pathID := uuid.Nil
	if c.Param("id") != "" {
		parsed, err := uuid.Parse(c.Param("id"))
		if err != nil {
			progress.fail("invalid id")
			writeInvalidRequest(c, "invalid id")
			return
		}
		pathID = parsed
	}

	pod, reqErr := h.savePublishedPod(c.Request.Context(), principalID, pathID, req, progress)
	if reqErr != nil {
		progress.fail(reqErr.UserMessage)
		writeRequestError(c, reqErr)
		return
	}

	progress.succeed("Published Pod saved to the catalog.")
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.save",
		TargetKind:       "pod",
		PodID:            &pod.ID,
		Metadata:         map[string]any{"is_update": pathID != uuid.Nil},
	})
	c.JSON(http.StatusOK, pod)
}

func (h *PodsHandler) UpdatePublishedStatus(c *gin.Context) {
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

	var req updatePublishedPodStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	status, err := parsePublishedPodStatus(req.Status)
	if err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "parse published pod status", err)
		return
	}

	q := database.New(h.DB)
	if _, err := q.GetPublishedPodByID(c.Request.Context(), podID); errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	} else if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod", "load published pod for status update", err)
		return
	}

	if err := q.UpdatePublishedPodStatus(c.Request.Context(), database.UpdatePublishedPodStatusParams{
		ID:     podID,
		Status: status,
	}); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update published pod", "update published pod status", err)
		return
	}

	row, err := q.GetPublishedPodByID(c.Request.Context(), podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to reload published pod", "reload published pod after status update", err)
		return
	}

	pods, err := h.hydratePublishedPods(c.Request.Context(), q, []publishedPodBase{publishedRowToBase(row)})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load published pod details", "hydrate status-updated published pod", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.status_update",
		TargetKind:       "pod",
		PodID:            &podID,
		Metadata:         map[string]any{"status": req.Status},
	})
	c.JSON(http.StatusOK, pods[0])
}

func (h *PodsHandler) DeletePublished(c *gin.Context) {
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

	ctx := c.Request.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "begin published pod delete tx", err)
		return
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	cloneCount, err := q.GetPublishedPodCloneCountForDelete(ctx, podID)
	if status, message, decided := publishedPodDeleteDecision(cloneCount, err); decided {
		if status == http.StatusNotFound {
			c.JSON(status, gin.H{"error": message})
			return
		}
		if status == http.StatusConflict {
			c.JSON(status, gin.H{"error": message})
			return
		}
	} else if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "load published pod clone count", err)
		return
	}

	deleted, err := q.DeletePublishedPod(ctx, podID)
	if err != nil {
		if publishedPodDeleteHasCloneConflict(err) {
			log.Printf("delete published pod invariant drift for %s: %v", podID, err)
			writeConflict(c, publishedPodDeleteBlockedMessage)
			return
		}
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "delete published pod", err)
		return
	}
	if deleted == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		if publishedPodDeleteHasCloneConflict(err) {
			log.Printf("delete published pod commit invariant drift for %s: %v", podID, err)
			writeConflict(c, publishedPodDeleteBlockedMessage)
			return
		}
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "commit published pod delete tx", err)
		return
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.delete",
		TargetKind:       "pod",
		PodID:            &podID,
	})
	c.Status(http.StatusNoContent)
}

const publishedPodDeleteBlockedMessage = "delete all cloned pods before deleting this published pod"

func publishedPodDeleteHasCloneConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "23001" || pgErr.Code == "23503")
}

func publishedPodDeleteDecision(cloneCount int32, err error) (status int, message string, decided bool) {
	if errors.Is(err, pgx.ErrNoRows) {
		return http.StatusNotFound, "pod not found", true
	}
	if err != nil {
		return 0, "", false
	}
	if cloneCount > 0 {
		return http.StatusConflict, publishedPodDeleteBlockedMessage, true
	}
	return 0, "", true
}

func (h *PodsHandler) savePublishedPod(
	ctx context.Context,
	principalID uuid.UUID,
	pathID uuid.UUID,
	req publishPodRequest,
	progress *publishPodProgressReporter,
) (publishedPodResponse, *requestError) {
	normalized, reqErr := h.normalizePublishPodRequest(ctx, principalID, pathID, req)
	if reqErr != nil {
		return publishedPodResponse{}, reqErr
	}

	reloadQ := database.New(h.DB)
	existingRow, err := reloadQ.GetPublishedPodByID(ctx, normalized.ID)
	exists := err == nil
	if errors.Is(err, pgx.ErrNoRows) && pathID != uuid.Nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "pod not found",
		}
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load published pod",
			Operation:   "load published pod before save",
			Err:         err,
		}
	}

	replacedTemplateIDs := []uuid.UUID{}
	createdTemplateIDs := []uuid.UUID{}
	if exists && existingRow.SourceFolderID == normalized.SourceFolderID {
		existingVMs, err := reloadQ.ListPublishedPodVMsByPodIDs(ctx, []uuid.UUID{normalized.ID})
		if err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load published pod VMs",
				Operation:   "load existing published pod VMs before save",
				Err:         err,
			}
		}
		if len(normalized.UpdateVirtualMachines) == 0 {
			normalized.VirtualMachines, reqErr = preservePublishedPodTemplateRefs(normalized.VirtualMachines, existingVMs)
			if reqErr != nil {
				return publishedPodResponse{}, reqErr
			}
		} else {
			normalized.VirtualMachines, replacedTemplateIDs, reqErr = h.updatePublishedPodTemplates(ctx, principalID, normalized, existingVMs, progress)
			if reqErr != nil {
				return publishedPodResponse{}, reqErr
			}
			createdTemplateIDs = newPublishedPodTemplateIDs(normalized.VirtualMachines, existingVMs)
		}
	} else {
		normalized.VirtualMachines, reqErr = h.preparePublishedPodTemplates(ctx, principalID, normalized, progress)
		if reqErr != nil {
			return publishedPodResponse{}, reqErr
		}
		createdTemplateIDs = publishedPodTemplateIDs(normalized.VirtualMachines)
	}

	progress.set(publishProgressStepSaving, "Writing the published Pod metadata to the catalog.")
	cleanupCreatedTemplates := true
	defer func() {
		if cleanupCreatedTemplates {
			h.cleanupPublishedPodTemplates(createdTemplateIDs)
		}
	}()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save published pod",
			Operation:   "begin published pod tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	slug, err := h.uniquePublishedPodSlug(ctx, q, normalized.Title, normalized.ID)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to allocate pod slug",
			Operation:   "allocate published pod slug",
			Err:         err,
		}
	}

	if exists {
		if _, err := q.UpdatePublishedPod(ctx, database.UpdatePublishedPodParams{
			ID:             normalized.ID,
			Title:          normalized.Title,
			Slug:           slug,
			Description:    normalized.Description,
			ImageUrl:       normalized.Image,
			Status:         normalized.Status,
			SourceFolderID: normalized.SourceFolderID,
		}); err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to update published pod",
				Operation:   "update published pod",
				Err:         err,
			}
		}
	} else {
		if _, err := q.CreatePublishedPod(ctx, database.CreatePublishedPodParams{
			ID:                   normalized.ID,
			Title:                normalized.Title,
			Slug:                 slug,
			Description:          normalized.Description,
			ImageUrl:             normalized.Image,
			Status:               normalized.Status,
			SourceFolderID:       normalized.SourceFolderID,
			PublisherPrincipalID: principalID,
			NetworkProfileKey:    normalized.NetworkProfileKey,
		}); err != nil {
			return publishedPodResponse{}, &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to create published pod",
				Operation:   "create published pod",
				Err:         err,
			}
		}
	}

	if err := h.replacePublishedPodChildren(ctx, q, normalized); err != nil {
		return publishedPodResponse{}, err
	}

	cleanupCreatedTemplates = false
	if err := tx.Commit(ctx); err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to save published pod",
			Operation:   "commit published pod tx",
			Err:         err,
		}
	}

	if len(replacedTemplateIDs) > 0 {
		progress.set(publishProgressStepSaving, "Deleting replaced Pod Template VMs.")
		if reqErr := h.deletePublishedPodTemplates(ctx, replacedTemplateIDs); reqErr != nil {
			return publishedPodResponse{}, reqErr
		}
	}

	row, err := reloadQ.GetPublishedPodByID(ctx, normalized.ID)
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to reload published pod",
			Operation:   "reload published pod after save",
			Err:         err,
		}
	}
	pods, err := h.hydratePublishedPods(ctx, reloadQ, []publishedPodBase{publishedRowToBase(row)})
	if err != nil {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load published pod details",
			Operation:   "hydrate saved published pod",
			Err:         err,
		}
	}
	if len(pods) == 0 {
		return publishedPodResponse{}, &requestError{
			Status:      http.StatusNotFound,
			UserMessage: "pod not found",
		}
	}

	return pods[0], nil
}
