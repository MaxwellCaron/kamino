package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

const (
	// publishCloneConcurrency bounds how many Pod VMs are cloned at once.
	publishCloneConcurrency = 2
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

	q := database.New(h.DB)
	deleted, err := q.DeletePublishedPod(c.Request.Context(), podID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to delete published pod", "delete published pod", err)
		return
	}
	if deleted == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "pod not found"})
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.publish.delete",
		TargetKind:       "pod",
		PodID:            &podID,
	})
	c.Status(http.StatusNoContent)
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

type normalizedPublishPodRequest struct {
	ID                    uuid.UUID
	Title                 string
	Description           string
	Image                 string
	Status                database.PublishedPodStatus
	SourceFolderID        uuid.UUID
	NetworkProfileKey     string
	CreatorIDs            []uuid.UUID
	AudienceIDs           []uuid.UUID
	VirtualMachines       []normalizedPublishPodVM
	UpdateVirtualMachines []uuid.UUID
	Tasks                 []normalizedPublishPodTask
}

type normalizedPublishPodVM struct {
	PublishedPodVMID       uuid.UUID
	RequestInventoryItemID uuid.UUID
	SourceInventoryItemID  uuid.UUID
	Name                   string
	CPUCount               int32
	MemoryGB               int32
	StorageGB              int32
	AllowMask              int64
	DenyMask               int64
	IsRouter               bool
	SegmentKey             *string
}

type normalizedPublishPodTask struct {
	ID        uuid.UUID
	Title     string
	Content   string
	Questions []normalizedPublishPodQuestion
}

type normalizedPublishPodQuestion struct {
	ID            uuid.UUID
	Title         string
	AnswerOutline string
	Description   *string
	Hint          *string
}

func (h *PodsHandler) normalizePublishPodRequest(
	ctx context.Context,
	principalID uuid.UUID,
	pathID uuid.UUID,
	req publishPodRequest,
) (normalizedPublishPodRequest, *requestError) {
	podID := pathID
	if podID == uuid.Nil {
		if strings.TrimSpace(req.ID) != "" {
			parsed, err := uuid.Parse(req.ID)
			if err != nil {
				return normalizedPublishPodRequest{}, invalidPublishPod("invalid pod id")
			}
			podID = parsed
		} else {
			podID = uuid.New()
		}
	} else if strings.TrimSpace(req.ID) != "" && req.ID != podID.String() {
		return normalizedPublishPodRequest{}, invalidPublishPod("request id does not match route id")
	}

	title := strings.TrimSpace(req.Title)
	if title == "" || len(title) > 32 {
		return normalizedPublishPodRequest{}, invalidPublishPod("title must be between 1 and 32 characters")
	}
	description := strings.TrimSpace(req.Description)
	if description == "" || len(description) > 128 {
		return normalizedPublishPodRequest{}, invalidPublishPod("description must be between 1 and 128 characters")
	}
	image := strings.TrimSpace(req.Image)
	if _, err := url.ParseRequestURI(image); image == "" || err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod("image must be a valid URL")
	}
	status, err := parsePublishedPodStatus(req.Status)
	if err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod(err.Error())
	}

	podFolderID, err := uuid.Parse(req.SourceFolder)
	if err != nil {
		return normalizedPublishPodRequest{}, invalidPublishPod("select a Pod Folder")
	}
	podFolders, err := h.publishPodFolders(ctx, principalID, podID)
	if err != nil {
		return normalizedPublishPodRequest{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load Pod Folders",
			Operation:   "load Pod Folders for published pod validation",
			Err:         err,
		}
	}

	podFolder, ok := findPodFolder(podFolders, podFolderID)
	if !ok {
		return normalizedPublishPodRequest{}, invalidPublishPod("Pod Folder is not available")
	}
	for _, vm := range podFolder.VirtualMachines {
		if vm.GuestType == "lxc" {
			return normalizedPublishPodRequest{}, invalidPublishPod("pods containing containers cannot be published")
		}
	}

	principalQ := database.New(h.DB)
	creatorIDs, reqErr := normalizePrincipalRequests(ctx, principalQ, req.Creators, 1, 5, "creator")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	audienceIDs, reqErr := normalizePrincipalRequests(ctx, principalQ, req.Audience, 0, 1<<31-1, "audience")
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	vms, reqErr := normalizePublishPodVMs(req.VirtualMachines, podFolder.VirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	updateVMs, reqErr := normalizePublishPodUpdateVMs(req.UpdateVirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	tasks, reqErr := normalizePublishPodTasks(req.Tasks)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}

	networkProfileKey, vmAssignments, reqErr := h.validatePublishablePodNetwork(ctx, podFolderID, podFolder.VirtualMachines)
	if reqErr != nil {
		return normalizedPublishPodRequest{}, reqErr
	}
	vms, reqErr = applyPublishNetworkAssignments(vms, vmAssignments)

	return normalizedPublishPodRequest{
		ID:                    podID,
		Title:                 title,
		Description:           description,
		Image:                 image,
		Status:                status,
		SourceFolderID:        podFolderID,
		NetworkProfileKey:     networkProfileKey,
		CreatorIDs:            creatorIDs,
		AudienceIDs:           audienceIDs,
		VirtualMachines:       vms,
		UpdateVirtualMachines: updateVMs,
		Tasks:                 tasks,
	}, nil
}

func (h *PodsHandler) replacePublishedPodChildren(
	ctx context.Context,
	q *database.Queries,
	req normalizedPublishPodRequest,
) *requestError {
	existingTasks, err := q.ListPublishedPodTasksByPodIDs(ctx, []uuid.UUID{req.ID})
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "load existing published pod tasks",
			Err:         err,
		}
	}
	existingTaskIDs := make(map[uuid.UUID]struct{}, len(existingTasks))
	existingTaskIDList := make([]uuid.UUID, 0, len(existingTasks))
	for _, task := range existingTasks {
		existingTaskIDs[task.ID] = struct{}{}
		existingTaskIDList = append(existingTaskIDList, task.ID)
	}

	existingQuestionsByID := map[uuid.UUID]database.ListPublishedPodQuestionsByTaskIDsRow{}
	if len(existingTaskIDList) > 0 {
		existingQuestions, err := q.ListPublishedPodQuestionsByTaskIDs(ctx, existingTaskIDList)
		if err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to replace published pod details",
				Operation:   "load existing published pod questions",
				Err:         err,
			}
		}
		for _, question := range existingQuestions {
			existingQuestionsByID[question.ID] = question
		}
	}

	for _, deleteFn := range []func(context.Context, uuid.UUID) error{
		q.DeletePublishedPodCreators,
		q.DeletePublishedPodAudience,
	} {
		if err := deleteFn(ctx, req.ID); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to replace published pod details",
				Operation:   "delete published pod children",
				Err:         err,
			}
		}
	}
	if err := q.OffsetPublishedPodTaskSortOrders(ctx, database.OffsetPublishedPodTaskSortOrdersParams{
		PodID:      req.ID,
		SortOffset: publishPodSortOrderOffset,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "offset published pod task sort orders",
			Err:         err,
		}
	}
	if err := q.OffsetPublishedPodQuestionSortOrders(ctx, database.OffsetPublishedPodQuestionSortOrdersParams{
		PodID:      req.ID,
		SortOffset: publishPodSortOrderOffset,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "offset published pod question sort orders",
			Err:         err,
		}
	}

	for index, principalID := range req.CreatorIDs {
		if err := q.InsertPublishedPodCreator(ctx, database.InsertPublishedPodCreatorParams{
			PodID:       req.ID,
			PrincipalID: principalID,
			SortOrder:   int32(index),
		}); err != nil {
			return childInsertError("insert published pod creator", err)
		}
	}
	for index, principalID := range req.AudienceIDs {
		if err := q.InsertPublishedPodAudience(ctx, database.InsertPublishedPodAudienceParams{
			PodID:       req.ID,
			PrincipalID: principalID,
			SortOrder:   int32(index),
		}); err != nil {
			return childInsertError("insert published pod audience", err)
		}
	}
	keptVMIDs := make([]uuid.UUID, 0, len(req.VirtualMachines))
	for index, vm := range req.VirtualMachines {
		publishedVMID := vm.PublishedPodVMID
		if publishedVMID == uuid.Nil {
			publishedVMID = uuid.New()
			if err := q.InsertPublishedPodVM(ctx, database.InsertPublishedPodVMParams{
				ID:                    publishedVMID,
				PodID:                 req.ID,
				SourceInventoryItemID: vm.SourceInventoryItemID,
				Name:                  vm.Name,
				CpuCount:              vm.CPUCount,
				MemoryMb:              vm.MemoryGB * 1024,
				DiskGb:                float64(vm.StorageGB),
				AllowMask:             vm.AllowMask,
				DenyMask:              vm.DenyMask,
				IsRouter:              vm.IsRouter,
				SegmentKey:            vm.SegmentKey,
				SortOrder:             int32(index),
			}); err != nil {
				return childInsertError("insert published pod vm", err)
			}
			keptVMIDs = append(keptVMIDs, publishedVMID)
			continue
		}

		if err := q.UpdatePublishedPodVM(ctx, database.UpdatePublishedPodVMParams{
			ID:                    publishedVMID,
			PodID:                 req.ID,
			SourceInventoryItemID: vm.SourceInventoryItemID,
			Name:                  vm.Name,
			CpuCount:              vm.CPUCount,
			MemoryMb:              vm.MemoryGB * 1024,
			DiskGb:                float64(vm.StorageGB),
			AllowMask:             vm.AllowMask,
			DenyMask:              vm.DenyMask,
			IsRouter:              vm.IsRouter,
			SegmentKey:            vm.SegmentKey,
			SortOrder:             int32(index),
		}); err != nil {
			return childInsertError("update published pod vm", err)
		}
		keptVMIDs = append(keptVMIDs, publishedVMID)
	}
	if err := q.DeletePublishedPodVMsExcept(ctx, database.DeletePublishedPodVMsExceptParams{
		PodID:   req.ID,
		KeepIds: keptVMIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod VMs",
			Err:         err,
		}
	}
	keptTaskIDs := make([]uuid.UUID, 0, len(req.Tasks))
	keptQuestionIDs := make([]uuid.UUID, 0)
	for taskIndex, task := range req.Tasks {
		taskID := task.ID
		keptTaskIDs = append(keptTaskIDs, taskID)
		if _, ok := existingTaskIDs[taskID]; ok {
			if err := q.UpdatePublishedPodTask(ctx, database.UpdatePublishedPodTaskParams{
				ID:        taskID,
				PodID:     req.ID,
				Title:     task.Title,
				Content:   task.Content,
				SortOrder: int32(taskIndex),
			}); err != nil {
				return childInsertError("update published pod task", err)
			}
		} else {
			if _, err := q.InsertPublishedPodTask(ctx, database.InsertPublishedPodTaskParams{
				ID:        taskID,
				PodID:     req.ID,
				Title:     task.Title,
				Content:   task.Content,
				SortOrder: int32(taskIndex),
			}); err != nil {
				return childInsertError("insert published pod task", err)
			}
		}
		for questionIndex, question := range task.Questions {
			questionID := question.ID
			keptQuestionIDs = append(keptQuestionIDs, questionID)
			if existing, ok := existingQuestionsByID[questionID]; ok {
				if publishedPodQuestionAnswerStateChanged(existing, question) {
					if err := q.DeleteClonedPodQuestionAnswersByQuestionID(ctx, questionID); err != nil {
						return &requestError{
							Status:      http.StatusInternalServerError,
							UserMessage: "failed to replace published pod details",
							Operation:   "reset changed published pod question answers",
							Err:         err,
						}
					}
				}
				if err := q.UpdatePublishedPodTaskQuestion(ctx, database.UpdatePublishedPodTaskQuestionParams{
					ID:            questionID,
					TaskID:        taskID,
					Title:         question.Title,
					AnswerOutline: question.AnswerOutline,
					Description:   question.Description,
					Hint:          question.Hint,
					SortOrder:     int32(questionIndex),
				}); err != nil {
					return childInsertError("update published pod task question", err)
				}
			} else {
				if err := q.InsertPublishedPodTaskQuestion(ctx, database.InsertPublishedPodTaskQuestionParams{
					ID:            questionID,
					TaskID:        taskID,
					Title:         question.Title,
					AnswerOutline: question.AnswerOutline,
					Description:   question.Description,
					Hint:          question.Hint,
					SortOrder:     int32(questionIndex),
				}); err != nil {
					return childInsertError("insert published pod task question", err)
				}
			}
		}
	}
	if err := q.DeletePublishedPodQuestionsExcept(ctx, database.DeletePublishedPodQuestionsExceptParams{
		PodID:   req.ID,
		KeepIds: keptQuestionIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod questions",
			Err:         err,
		}
	}
	if err := q.DeletePublishedPodTasksExcept(ctx, database.DeletePublishedPodTasksExceptParams{
		PodID:   req.ID,
		KeepIds: keptTaskIDs,
	}); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "delete removed published pod tasks",
			Err:         err,
		}
	}
	if err := q.RefreshClonedPodTaskStatesForPublishedPod(ctx, req.ID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace published pod details",
			Operation:   "refresh cloned pod task states",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) uniquePublishedPodSlug(
	ctx context.Context,
	q *database.Queries,
	title string,
	podID uuid.UUID,
) (string, error) {
	base := slugify(title)
	slug := base
	for suffix := 2; ; suffix++ {
		_, err := q.GetPublishedPodSlugConflict(ctx, database.GetPublishedPodSlugConflictParams{
			Slug: slug,
			ID:   podID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return slug, nil
		}
		if err != nil {
			return "", err
		}
		slug = fmt.Sprintf("%s-%d", base, suffix)
	}
}

func normalizePrincipalRequests(
	ctx context.Context,
	q *database.Queries,
	principals []publishPodPrincipalRequest,
	minCount int,
	maxCount int,
	label string,
) ([]uuid.UUID, *requestError) {
	if len(principals) < minCount {
		return nil, invalidPublishPod(fmt.Sprintf("add at least %d %s", minCount, label))
	}
	if len(principals) > maxCount {
		return nil, invalidPublishPod(fmt.Sprintf("too many %s principals", label))
	}

	seen := make(map[uuid.UUID]struct{}, len(principals))
	ids := make([]uuid.UUID, 0, len(principals))
	wantTypes := make(map[uuid.UUID]string, len(principals))
	for _, principal := range principals {
		principalID, err := uuid.Parse(principal.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid principal id")
		}
		if _, ok := seen[principalID]; ok {
			continue
		}
		seen[principalID] = struct{}{}
		ids = append(ids, principalID)
		wantTypes[principalID] = principal.Type
	}
	if len(ids) < minCount {
		return nil, invalidPublishPod(fmt.Sprintf("add at least %d %s", minCount, label))
	}
	if len(ids) == 0 {
		return ids, nil
	}

	rows, err := q.GetPrincipalsByIDs(ctx, ids)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to validate principals",
			Operation:   "validate published pod principals",
			Err:         err,
		}
	}
	gotTypes := make(map[uuid.UUID]database.PrincipalType, len(rows))
	for _, row := range rows {
		gotTypes[row.ID] = row.PrincipalType
	}
	for _, id := range ids {
		principalType, ok := gotTypes[id]
		if !ok {
			return nil, invalidPublishPod("principal not found")
		}
		if want := wantTypes[id]; want != "" && want != string(principalType) {
			return nil, invalidPublishPod("principal type does not match")
		}
	}

	return ids, nil
}

func normalizePublishPodVMs(
	requestVMs []publishPodVMRequest,
	podVMs []publishPodVMOption,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) == 0 {
		return nil, invalidPublishPod("select a Pod Folder with at least one VM")
	}
	if len(requestVMs) != len(podVMs) {
		return nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	podVMByID := make(map[uuid.UUID]publishPodVMOption, len(podVMs))
	podVMByName := make(map[string]publishPodVMOption, len(podVMs))
	for _, vm := range podVMs {
		podVMByID[vm.ID] = vm
		podVMByName[strings.ToLower(vm.Name)] = vm
	}

	seen := make(map[uuid.UUID]struct{}, len(requestVMs))
	vms := make([]normalizedPublishPodVM, 0, len(requestVMs))
	for _, vm := range requestVMs {
		vmID, err := uuid.Parse(vm.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid VM id")
		}
		podVM, ok := podVMByID[vmID]
		if !ok {
			podVM, ok = podVMByName[strings.ToLower(strings.TrimSpace(vm.Name))]
		}
		if !ok {
			return nil, invalidPublishPod("VM is not available in the selected Pod Folder")
		}
		if _, ok := seen[podVM.ID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}
		if err := validatePublishedPodPermissions(vm.Permissions); err != nil {
			return nil, invalidPublishPod(err.Error())
		}

		seen[podVM.ID] = struct{}{}
		vms = append(vms, normalizedPublishPodVM{
			RequestInventoryItemID: vmID,
			SourceInventoryItemID:  podVM.ID,
			Name:                   podVM.Name,
			CPUCount:               podVM.CPUCount,
			MemoryGB:               podVM.MemoryGB,
			StorageGB:              podVM.StorageGB,
			AllowMask:              vm.Permissions.AllowMask,
			DenyMask:               vm.Permissions.DenyMask,
		})
	}

	return vms, nil
}

func normalizePublishPodUpdateVMs(values []string) ([]uuid.UUID, *requestError) {
	if len(values) == 0 {
		return []uuid.UUID{}, nil
	}

	seen := make(map[uuid.UUID]struct{}, len(values))
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := uuid.Parse(strings.TrimSpace(value))
		if err != nil {
			return nil, invalidPublishPod("invalid VM update id")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	return ids, nil
}

func preservePublishedPodTemplateRefs(
	requestVMs []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) ([]normalizedPublishPodVM, *requestError) {
	if len(requestVMs) != len(existingVMs) {
		return nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	existingByID := make(map[uuid.UUID]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	existingByName := make(map[string]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	for _, vm := range existingVMs {
		existingByID[vm.SourceInventoryItemID] = vm
		existingByName[strings.ToLower(vm.Name)] = vm
	}

	seen := make(map[uuid.UUID]struct{}, len(requestVMs))
	preserved := make([]normalizedPublishPodVM, 0, len(requestVMs))
	for _, requestVM := range requestVMs {
		existing, ok := existingByID[requestVM.RequestInventoryItemID]
		if !ok {
			existing, ok = existingByName[strings.ToLower(requestVM.Name)]
		}
		if !ok {
			return nil, invalidPublishPod("published VMs must match the existing Pod Template VMs")
		}
		if _, ok := seen[existing.SourceInventoryItemID]; ok {
			return nil, invalidPublishPod("duplicate VM in publish request")
		}

		seen[existing.SourceInventoryItemID] = struct{}{}
		preserved = append(preserved, normalizedPublishPodVM{
			PublishedPodVMID:       existing.ID,
			RequestInventoryItemID: requestVM.RequestInventoryItemID,
			SourceInventoryItemID:  existing.SourceInventoryItemID,
			Name:                   existing.Name,
			CPUCount:               existing.CpuCount,
			MemoryGB:               memoryMBToGB(&existing.MemoryMb),
			StorageGB:              diskGBToInt(&existing.DiskGb),
			AllowMask:              requestVM.AllowMask,
			DenyMask:               requestVM.DenyMask,
		})
	}

	return preserved, nil
}

func (h *PodsHandler) updatePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, []uuid.UUID, *requestError) {
	if len(req.VirtualMachines) != len(existingVMs) {
		return nil, nil, invalidPublishPod("published VMs must match the selected Pod Folder")
	}

	selected := make(map[uuid.UUID]struct{}, len(req.UpdateVirtualMachines))
	for _, id := range req.UpdateVirtualMachines {
		selected[id] = struct{}{}
	}

	existingByID := make(map[uuid.UUID]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	existingByName := make(map[string]database.ListPublishedPodVMsByPodIDsRow, len(existingVMs))
	for _, vm := range existingVMs {
		existingByID[vm.SourceInventoryItemID] = vm
		existingByName[strings.ToLower(vm.Name)] = vm
	}

	seenExisting := make(map[uuid.UUID]struct{}, len(req.VirtualMachines))
	matchedSelected := make(map[uuid.UUID]struct{}, len(selected))
	publishedVMIDByRequestID := make(map[uuid.UUID]uuid.UUID, len(selected))
	updateVMs := make([]normalizedPublishPodVM, 0, len(selected))
	replacedTemplateIDs := make([]uuid.UUID, 0, len(selected))
	output := make([]normalizedPublishPodVM, len(req.VirtualMachines))

	for index, requestVM := range req.VirtualMachines {
		existing, ok := existingByID[requestVM.RequestInventoryItemID]
		if !ok {
			existing, ok = existingByName[strings.ToLower(requestVM.Name)]
		}
		if !ok {
			return nil, nil, invalidPublishPod("published VMs must match the existing Pod Template VMs")
		}
		if _, ok := seenExisting[existing.SourceInventoryItemID]; ok {
			return nil, nil, invalidPublishPod("duplicate VM in publish request")
		}
		seenExisting[existing.SourceInventoryItemID] = struct{}{}

		update := markSelectedUpdateVM(
			selected,
			matchedSelected,
			requestVM.RequestInventoryItemID,
			requestVM.SourceInventoryItemID,
			existing.SourceInventoryItemID,
		)
		if !update {
			output[index] = normalizedPublishPodVM{
				PublishedPodVMID:       existing.ID,
				RequestInventoryItemID: requestVM.RequestInventoryItemID,
				SourceInventoryItemID:  existing.SourceInventoryItemID,
				Name:                   existing.Name,
				CPUCount:               existing.CpuCount,
				MemoryGB:               memoryMBToGB(&existing.MemoryMb),
				StorageGB:              diskGBToInt(&existing.DiskGb),
				AllowMask:              requestVM.AllowMask,
				DenyMask:               requestVM.DenyMask,
			}
			continue
		}

		updateVMs = append(updateVMs, requestVM)
		publishedVMIDByRequestID[requestVM.RequestInventoryItemID] = existing.ID
		replacedTemplateIDs = append(replacedTemplateIDs, existing.SourceInventoryItemID)
	}

	if len(matchedSelected) != len(selected) {
		return nil, nil, invalidPublishPod("selected VM updates must match the published pod VMs")
	}
	if len(updateVMs) == 0 {
		return output, []uuid.UUID{}, nil
	}

	progress.set(publishProgressStepPreparing, "Preparing selected Pod Template VMs for update.")
	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM update",
	); reqErr != nil {
		return nil, nil, reqErr
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template update target node",
			Err:         err,
		}
	}

	updated, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, updateVMs, progress)
	if reqErr != nil {
		return nil, nil, reqErr
	}
	updatedByRequestID := make(map[uuid.UUID]normalizedPublishPodVM, len(updated))
	for _, vm := range updated {
		updatedByRequestID[vm.RequestInventoryItemID] = vm
	}
	for index, requestVM := range req.VirtualMachines {
		if output[index].SourceInventoryItemID != uuid.Nil {
			continue
		}
		updatedVM, ok := updatedByRequestID[requestVM.RequestInventoryItemID]
		if !ok {
			return nil, nil, invalidPublishPod("failed to match updated VM")
		}
		updatedVM.PublishedPodVMID = publishedVMIDByRequestID[requestVM.RequestInventoryItemID]
		output[index] = updatedVM
	}

	return output, replacedTemplateIDs, nil
}

func markSelectedUpdateVM(
	selected map[uuid.UUID]struct{},
	matched map[uuid.UUID]struct{},
	ids ...uuid.UUID,
) bool {
	update := false
	for _, id := range ids {
		if _, ok := selected[id]; ok {
			matched[id] = struct{}{}
			update = true
		}
	}
	return update
}

func (h *PodsHandler) preparePublishedPodTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	req normalizedPublishPodRequest,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	if req.SourceFolderID == uuid.Nil {
		return nil, invalidPublishPod("select a Pod Folder")
	}
	if len(req.VirtualMachines) == 0 {
		return nil, invalidPublishPod("select a Pod Folder with at least one VM")
	}

	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		req.SourceFolderID,
		authorization.CreateFolder,
		"authorize published pod template folder creation",
	); reqErr != nil {
		return nil, reqErr
	}

	progress.set(publishProgressStepPreparing, "Creating or finding the Pod Template Folder inside the selected Pod Folder.")

	templateFolderID, err := h.Service.EnsureChildFolderWithDescription(
		ctx,
		req.SourceFolderID,
		publishedPodTemplateFolderName,
		new(inventory.PurposePublishedPodTemplateFolderDescription),
	)
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reqErr := requireInventoryPermissionRequest(
		ctx,
		h.Authz,
		principalID,
		templateFolderID,
		authorization.CreateVM,
		"authorize published Pod Template VM creation",
	); reqErr != nil {
		return nil, reqErr
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, templateFolderID, int32(len(req.VirtualMachines)), "pod_template_vms")
	if err != nil {
		return nil, inventoryRequestError(err)
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, templateFolderID)
	if err != nil {
		return nil, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return nil, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve published pod template clone target node",
			Err:         err,
		}
	}

	prepared, reqErr := h.clonePreparedVMsIntoTemplates(ctx, principalID, placement, targetNode, req.VirtualMachines, progress)
	if reqErr != nil {
		return nil, reqErr
	}

	return prepared, nil
}

// clonePreparedVMsIntoTemplates clones each Pod VM into the Pod Template Folder
// and converts it to a Pod Template VM, a few at a time, cleaning up on any
// failure.
func (h *PodsHandler) clonePreparedVMsIntoTemplates(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	vms []normalizedPublishPodVM,
	progress *publishPodProgressReporter,
) ([]normalizedPublishPodVM, *requestError) {
	prepared := make([]normalizedPublishPodVM, len(vms))
	routerTemplateID := uuid.Nil
	for _, vm := range vms {
		if !vm.IsRouter {
			continue
		}

		var err error
		routerTemplateID, err = publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			SourceInventoryItemID: vm.SourceInventoryItemID,
			IsRouter:              vm.IsRouter,
		}, h.RouterTemplateItemID)
		if err != nil {
			return nil, &requestError{
				Status:      http.StatusConflict,
				UserMessage: err.Error(),
			}
		}
		if _, reqErr := h.resolvePublishedPodVMTemplate(ctx, routerTemplateID); reqErr != nil {
			return nil, reqErr
		}
		break
	}

	// Count non-router VMs; only those are cloned and need VMID allocation.
	nonRouterCount := 0
	for _, vm := range vms {
		if !isPodRouterName(vm.Name) {
			nonRouterCount++
		}
	}
	var batch *vmidalloc.Batch
	if nonRouterCount > 0 {
		var batchErr error
		batch, batchErr = h.Allocator.NewBatch(ctx, h.PublishVMIDRange, nonRouterCount)
		if batchErr != nil {
			return nil, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: fmt.Sprintf("insufficient VMID capacity in publish range (%d–%d) for %d VMs", h.PublishVMIDRange.Min, h.PublishVMIDRange.Max, nonRouterCount),
				Operation:   "allocate publish VMID batch",
				Err:         batchErr,
			}
		}
		defer batch.Release()
	}

	created := make(map[int]clonedVM, len(vms))
	var createdMu sync.Mutex

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)

	for i, vm := range vms {
		if isPodRouterName(vm.Name) {
			out := vm
			out.SourceInventoryItemID = routerTemplateID
			prepared[i] = out
			continue
		}

		group.Go(func() error {
			progress.set(publishProgressStepCloning, "Cloning Pod VM "+vm.Name)
			clone, reqErr := h.cloneVMIntoFolder(gctx, principalID, vm.SourceInventoryItemID, placement, targetNode, vm.Name, true, cloneVMOptions{
				batch: batch,
				onStarted: func(node string, vmid int) {
					createdMu.Lock()
					created[vmid] = clonedVM{TargetNode: node, VMID: vmid}
					createdMu.Unlock()
				},
			})
			if reqErr != nil {
				return reqErr
			}
			createdMu.Lock()
			created[clone.VMID] = clone
			createdMu.Unlock()

			progress.set(publishProgressStepCloning, "Converting "+vm.Name+" to a Pod Template VM")
			if reqErr := h.convertCloneToTemplate(gctx, clone); reqErr != nil {
				return reqErr
			}

			out := vm
			out.SourceInventoryItemID = clone.InventoryItemID
			prepared[i] = out
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		h.cleanupPublishClones(created)
		var reqErr *requestError
		if errors.As(err, &reqErr) {
			return nil, reqErr
		}
		return nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone Pod VMs",
			Operation:   "clone published pod VMs",
			Err:         err,
		}
	}

	return prepared, nil
}

type clonedVM struct {
	SourceItemID    uuid.UUID
	InventoryItemID uuid.UUID
	TargetNode      string
	VMID            int
}

// cloneVMOptions holds concurrency/cleanup hooks for VM cloning.
type cloneVMOptions struct {
	batch     *vmidalloc.Batch
	onStarted func(node string, vmid int)
	onSynced  func(clonedVM)
}

// cloneVMIntoFolder authorizes the source, clones it into the folder, stamps a
// fresh identity, syncs pool membership, and imports it into the inventory.
func (h *PodsHandler) cloneVMIntoFolder(
	ctx context.Context,
	principalID uuid.UUID,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		sourceItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}

	return h.cloneVerifiedVMIntoFolder(ctx, source, sourceItemID, placement, targetNode, name, full, opts)
}

func (h *PodsHandler) cloneVerifiedVMIntoFolder(
	ctx context.Context,
	source verifiedVMTarget,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	task, newID, reqErr := h.startVMClone(ctx, source, targetNode, name, full, opts.batch)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}
	if opts.onStarted != nil {
		opts.onStarted(targetNode, newID)
	}

	if err := h.PX.WaitForTask(ctx, task.Node, task.UPID); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "clone pod VM",
			Err:         err,
		}
	}
	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign clone identity",
			Operation:   "assign pod clone identity",
			Err:         err,
		}
	}
	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync VM pool membership",
			Operation:   "sync pod clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID, proxmox.GuestQEMU)
	if err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync pod clone inventory metadata",
			Err:         err,
		}
	}

	clone := clonedVM{
		SourceItemID:    sourceItemID,
		InventoryItemID: clonedItemID,
		TargetNode:      targetNode,
		VMID:            newID,
	}
	if opts.onSynced != nil {
		opts.onSynced(clone)
	}

	return clone, nil
}

// startVMClone claims a VMID via batch and starts the clone task.
func (h *PodsHandler) startVMClone(
	ctx context.Context,
	source verifiedVMTarget,
	targetNode string,
	name string,
	full bool,
	batch *vmidalloc.Batch,
) (proxmox.CloneTask, int, *requestError) {
	var task proxmox.CloneTask
	newID, err := batch.Claim(ctx, func(vmid int) error {
		var cloneErr error
		task, cloneErr = h.PX.StartCloneVM(ctx, source.Node, source.VMID, vmid, name, full, targetNode)
		return cloneErr
	})
	if err != nil {
		if vmidalloc.IsRangeExhausted(err) {
			return proxmox.CloneTask{}, 0, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "no available VMID in the configured workflow range",
				Operation:   "allocate pod clone vmid",
				Err:         err,
			}
		}
		return proxmox.CloneTask{}, 0, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "start pod clone",
			Err:         err,
		}
	}
	return task, newID, nil
}

func (h *PodsHandler) convertCloneToTemplate(ctx context.Context, clone clonedVM) *requestError {
	if err := h.PX.ConvertToTemplate(ctx, clone.TargetNode, clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to convert Pod VM clone to Pod Template VM",
			Operation:   "convert published pod VM clone to Pod Template VM",
			Err:         err,
		}
	}

	if err := h.Service.UpdateInventoryVMIsTemplate(ctx, clone.InventoryItemID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "Pod VM clone converted in Proxmox but failed to update inventory metadata",
			Operation:   "update published pod VM clone Pod Template VM state",
			Err:         err,
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	return nil
}

// cleanupPublishClones best-effort deletes clones from a failed publish, using a
// fresh context since the publish context is usually already cancelled.
func (h *PodsHandler) cleanupPublishClones(created map[int]clonedVM) {
	if len(created) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for _, clone := range created {
		if err := h.PX.DeleteVM(ctx, proxmox.GuestQEMU, clone.TargetNode, clone.VMID); err != nil {
			log.Printf("publish cleanup: failed to delete Proxmox VM %d on %s: %v", clone.VMID, clone.TargetNode, err)
		}
		if clone.InventoryItemID != uuid.Nil {
			if err := h.Service.DeleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
				log.Printf("publish cleanup: failed to delete inventory item %s: %v", clone.InventoryItemID, err)
			}
		}
	}
}

func (h *PodsHandler) cleanupPublishedPodTemplates(templateItemIDs []uuid.UUID) {
	if len(templateItemIDs) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if reqErr := h.deletePublishedPodTemplates(ctx, templateItemIDs); reqErr != nil {
		log.Printf("publish cleanup: failed to delete orphaned Pod Template VMs: %s", reqErr.Error())
	}
}

func (h *PodsHandler) deletePublishedPodTemplates(ctx context.Context, templateItemIDs []uuid.UUID) *requestError {
	q := database.New(h.DB)
	for _, id := range templateItemIDs {
		if id == uuid.Nil || id == h.RouterTemplateItemID {
			continue
		}

		row, err := q.GetProxmoxVMByInventoryItemID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load replaced Pod Template VM",
				Operation:   "load replaced published Pod Template VM",
				Err:         err,
			}
		}

		if err := h.deleteClonedPodProxmoxVM(ctx, row.Node, int(row.Vmid)); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to delete replaced Pod Template VM",
				Operation:   "delete replaced published Pod Template VM",
				Err:         err,
			}
		}
		if err := h.Service.DeleteInventoryVM(ctx, id); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to delete replaced Pod Template VM metadata",
				Operation:   "delete replaced published Pod Template VM inventory item",
				Err:         err,
			}
		}
	}

	return nil
}

func publishedPodTemplateIDs(vms []normalizedPublishPodVM) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID != uuid.Nil {
			ids = append(ids, vm.SourceInventoryItemID)
		}
	}
	return ids
}

func newPublishedPodTemplateIDs(
	vms []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) []uuid.UUID {
	existing := make(map[uuid.UUID]struct{}, len(existingVMs))
	for _, vm := range existingVMs {
		existing[vm.SourceInventoryItemID] = struct{}{}
	}

	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID == uuid.Nil {
			continue
		}
		if _, ok := existing[vm.SourceInventoryItemID]; ok {
			continue
		}
		ids = append(ids, vm.SourceInventoryItemID)
	}
	return ids
}

func normalizePublishPodTasks(tasks []publishPodTaskRequest) ([]normalizedPublishPodTask, *requestError) {
	if len(tasks) < 1 {
		return nil, invalidPublishPod("add at least one task")
	}
	if len(tasks) > 20 {
		return nil, invalidPublishPod("you can add up to 20 tasks")
	}

	normalized := make([]normalizedPublishPodTask, 0, len(tasks))
	for _, task := range tasks {
		taskID, err := parseOrNewUUID(task.ID)
		if err != nil {
			return nil, invalidPublishPod("invalid task id")
		}
		title := strings.TrimSpace(task.Title)
		if title == "" || len(title) > 64 {
			return nil, invalidPublishPod("task title must be between 1 and 64 characters")
		}
		content := strings.TrimSpace(task.Content)
		if content == "" || len(content) > publishPodTaskContentMaxLength {
			return nil, invalidPublishPod("task content must be between 1 and 4096 characters")
		}

		questions := make([]normalizedPublishPodQuestion, 0, len(task.Questions))
		for _, question := range task.Questions {
			questionID, err := parseOrNewUUID(question.ID)
			if err != nil {
				return nil, invalidPublishPod("invalid question id")
			}
			questionTitle := strings.TrimSpace(question.Title)
			answer := strings.TrimSpace(question.AnswerOutline)
			if questionTitle == "" || len(questionTitle) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("question must be between 1 and 256 characters")
			}
			if answer == "" || len(answer) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("answer must be between 1 and 256 characters")
			}
			hint := trimOptionalString(question.Hint)
			if hint != nil && len(*hint) > publishPodQuestionTextMaxLength {
				return nil, invalidPublishPod("hint must be at most 256 characters")
			}
			questions = append(questions, normalizedPublishPodQuestion{
				ID:            questionID,
				Title:         questionTitle,
				AnswerOutline: answer,
				Description:   trimOptionalString(question.Description),
				Hint:          hint,
			})
		}

		normalized = append(normalized, normalizedPublishPodTask{
			ID:        taskID,
			Title:     title,
			Content:   content,
			Questions: questions,
		})
	}

	return normalized, nil
}

const (
	publishPodQuestionTextMaxLength = 256
	publishPodTaskContentMaxLength  = 4096
	publishPodSortOrderOffset       = 10000
)

func validatePublishedPodPermissions(permissions publishPodPermissionRequest) error {
	if permissions.AllowMask < 0 || permissions.DenyMask < 0 {
		return fmt.Errorf("permission masks must be non-negative")
	}
	if permissions.AllowMask&permissions.DenyMask != 0 {
		return fmt.Errorf("permission masks cannot overlap")
	}
	if permissions.AllowMask|permissions.DenyMask > int64(authorization.FullAccessMask) {
		return fmt.Errorf("permission mask includes unsupported bits")
	}

	return nil
}

func parsePublishedPodStatus(status string) (database.PublishedPodStatus, error) {
	switch database.PublishedPodStatus(strings.TrimSpace(status)) {
	case database.PublishedPodStatusListed:
		return database.PublishedPodStatusListed, nil
	case database.PublishedPodStatusUnlisted:
		return database.PublishedPodStatusUnlisted, nil
	default:
		return "", fmt.Errorf("status must be listed or unlisted")
	}
}

func publishedPodQuestionAnswerStateChanged(
	existing database.ListPublishedPodQuestionsByTaskIDsRow,
	next normalizedPublishPodQuestion,
) bool {
	return existing.Title != next.Title || !answersMatch(existing.AnswerOutline, next.AnswerOutline)
}
