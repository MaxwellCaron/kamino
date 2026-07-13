package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
