package handlers

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func (h *PodsHandler) hydratePublishedPodClones(
	ctx context.Context,
	q *database.Queries,
	podID uuid.UUID,
) ([]publishedPodCloneResponse, error) {
	summaries, err := q.ListClonedPodSummariesByPodID(ctx, podID)
	if err != nil {
		return nil, err
	}
	if len(summaries) == 0 {
		return []publishedPodCloneResponse{}, nil
	}

	cloneIDs := make([]uuid.UUID, 0, len(summaries))
	for _, s := range summaries {
		cloneIDs = append(cloneIDs, s.ID)
	}

	statusByClone, err := h.clonedPodRuntimeStatusByCloneIDs(ctx, q, cloneIDs)
	if err != nil {
		return nil, err
	}

	response := make([]publishedPodCloneResponse, 0, len(summaries))
	for _, s := range summaries {
		progress := 0.0
		if s.TaskTotal > 0 {
			progress = (float64(s.TaskCompleted) / float64(s.TaskTotal)) * 100
		}

		network, err := h.buildPodNetworkMetadata(s.NetworkProfileKey, s.NetworkNumber)
		if err != nil {
			return nil, fmt.Errorf("clone %s network metadata: %w", s.ID, err)
		}

		response = append(response, publishedPodCloneResponse{
			ID:    s.ID,
			PodID: s.PodID,
			Owner: publishedPodCloneOwnerResponse{
				ID:          s.UserPrincipalID,
				Type:        string(s.PrincipalType),
				Label:       s.UserLabel,
				Description: s.UserDescription,
			},
			ClonedAt:  s.CreatedAt.Time,
			UpdatedAt: s.UpdatedAt.Time,
			Status:    statusByClone[s.ID],
			Network:   network,
			VMCount:   int32(s.VmCount),
			TaskSummary: publishedPodCloneTaskSummaryResponse{
				Total:     s.TaskTotal,
				Completed: s.TaskCompleted,
				Progress:  progress,
			},
		})
	}

	return response, nil
}

func (h *PodsHandler) hydratePublishedPods(
	ctx context.Context,
	q *database.Queries,
	bases []publishedPodBase,
) ([]publishedPodResponse, error) {
	if len(bases) == 0 {
		return []publishedPodResponse{}, nil
	}

	podIDs := make([]uuid.UUID, 0, len(bases))
	for _, pod := range bases {
		podIDs = append(podIDs, pod.ID)
	}

	creators, err := q.ListPublishedPodCreatorsByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	audience, err := q.ListPublishedPodAudienceByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	vms, err := q.ListPublishedPodVMsByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}
	taskRows, err := q.ListPublishedPodTasksByPodIDs(ctx, podIDs)
	if err != nil {
		return nil, err
	}

	creatorsByPod := make(map[uuid.UUID][]publishedPodPrincipalResponse, len(bases))
	for _, row := range creators {
		creatorsByPod[row.PodID] = append(creatorsByPod[row.PodID], publishedPrincipalFromCreator(row))
	}
	audienceByPod := make(map[uuid.UUID][]publishedPodPrincipalResponse, len(bases))
	for _, row := range audience {
		audienceByPod[row.PodID] = append(audienceByPod[row.PodID], publishedPrincipalFromAudience(row))
	}
	vmsByPod := make(map[uuid.UUID][]publishedPodVMResponse, len(bases))
	for _, row := range vms {
		vmsByPod[row.PodID] = append(vmsByPod[row.PodID], publishedVMFromRow(row))
	}

	taskIDs := make([]uuid.UUID, 0, len(taskRows))
	tasksByPod := make(map[uuid.UUID][]*publishedPodTaskResponse, len(bases))
	tasksByID := make(map[uuid.UUID]*publishedPodTaskResponse, len(taskRows))
	for _, row := range taskRows {
		task := &publishedPodTaskResponse{
			ID:        row.ID,
			Title:     row.Title,
			Content:   row.Content,
			Questions: []publishedPodQuestionResponse{},
		}
		taskIDs = append(taskIDs, row.ID)
		tasksByID[row.ID] = task
		tasksByPod[row.PodID] = append(tasksByPod[row.PodID], task)
	}
	if len(taskIDs) > 0 {
		questions, err := q.ListPublishedPodQuestionsByTaskIDs(ctx, taskIDs)
		if err != nil {
			return nil, err
		}
		for _, row := range questions {
			task, ok := tasksByID[row.TaskID]
			if !ok {
				continue
			}
			task.Questions = append(task.Questions, publishedQuestionFromRow(row))
		}
	}

	response := make([]publishedPodResponse, 0, len(bases))
	for _, base := range bases {
		taskResponses := make([]publishedPodTaskResponse, 0, len(tasksByPod[base.ID]))
		for _, task := range tasksByPod[base.ID] {
			taskResponses = append(taskResponses, *task)
		}

		response = append(response, publishedPodResponse{
			ID:              base.ID,
			Title:           base.Title,
			Slug:            base.Slug,
			Description:     base.Description,
			Image:           base.ImageURL,
			Creators:        nonNilPrincipals(creatorsByPod[base.ID]),
			CreatedAt:       base.CreatedAt,
			CloneCount:      base.CloneCount,
			Status:          string(base.Status),
			Audience:        nonNilPrincipals(audienceByPod[base.ID]),
			Tasks:           taskResponses,
			SourceFolder:    base.SourceFolderID,
			NetworkProfile:  base.NetworkProfileKey,
			VirtualMachines: nonNilVMs(vmsByPod[base.ID]),
		})
	}

	return response, nil
}
