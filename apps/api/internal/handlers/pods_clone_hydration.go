package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/google/uuid"
)

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
	vms, status, err := h.hydrateClonedPodVMs(ctx, q, principalID, clone.ID)
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

	network, err := h.clonedPodNetworkMetadata(clone)
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
) ([]clonedPodVMResponse, string, error) {
	rows, err := q.ListClonedPodVMs(ctx, cloneID)
	if err != nil {
		return nil, "", err
	}

	vmids := make([]int, 0, len(rows))
	for _, row := range rows {
		if row.Vmid != nil {
			vmids = append(vmids, int(*row.Vmid))
		}
	}
	statuses, resources, err := h.runtimeForVMIDs(ctx, vmids)
	if err != nil {
		return nil, "", err
	}

	vmStatuses := make([]string, 0, len(rows))
	for _, row := range rows {
		vmStatuses = append(vmStatuses, h.runtimeStatusForClonedVMRow(ctx, row, statuses))
	}
	aggregateStatus := clonedPodRuntimeStatus(vmStatuses)

	visibleItemIDs, err := h.visibleInventoryItemIDs(ctx, principalID)
	if err != nil {
		return nil, "", err
	}
	visibleRows := filterVisibleClonedPodVMRows(rows, visibleItemIDs)

	response := make([]clonedPodVMResponse, 0, len(visibleRows))
	for _, row := range visibleRows {
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

	return response, aggregateStatus, nil
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

	directStatus, err := h.PX.GetVMRuntimeStatus(ctx, proxmox.GuestQEMU, strings.TrimSpace(*row.Node), vmid)
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

func vmStatusListFromRuntimeVMRows(
	rows []database.ListClonedPodRuntimeVMsByCloneIDsRow,
	statuses map[int]string,
) []string {
	vmStatusList := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.Vmid == nil {
			vmStatusList = append(vmStatusList, "missing")
			continue
		}
		st, ok := statuses[int(*row.Vmid)]
		if !ok {
			vmStatusList = append(vmStatusList, "missing")
			continue
		}
		vmStatusList = append(vmStatusList, st)
	}
	if len(vmStatusList) == 0 {
		vmStatusList = []string{"missing"}
	}
	return vmStatusList
}

func aggregateClonedPodRuntimeStatusByClone(
	vmRows []database.ListClonedPodRuntimeVMsByCloneIDsRow,
	statuses map[int]string,
) map[uuid.UUID]string {
	vmsByClone := make(map[uuid.UUID][]database.ListClonedPodRuntimeVMsByCloneIDsRow)
	for _, row := range vmRows {
		vmsByClone[row.ClonedPodID] = append(vmsByClone[row.ClonedPodID], row)
	}

	result := make(map[uuid.UUID]string, len(vmsByClone))
	for cloneID, rows := range vmsByClone {
		result[cloneID] = clonedPodRuntimeStatus(vmStatusListFromRuntimeVMRows(rows, statuses))
	}
	return result
}

func (h *PodsHandler) clonedPodRuntimeStatusByCloneIDs(
	ctx context.Context,
	q *database.Queries,
	cloneIDs []uuid.UUID,
) (map[uuid.UUID]string, error) {
	if len(cloneIDs) == 0 {
		return map[uuid.UUID]string{}, nil
	}

	vmRows, err := q.ListClonedPodRuntimeVMsByCloneIDs(ctx, cloneIDs)
	if err != nil {
		return nil, err
	}

	allVMIDs := make([]int, 0, len(vmRows))
	for _, row := range vmRows {
		if row.Vmid != nil {
			allVMIDs = append(allVMIDs, int(*row.Vmid))
		}
	}

	statuses, _, err := h.runtimeForVMIDs(ctx, allVMIDs)
	if err != nil {
		return nil, err
	}

	byClone := aggregateClonedPodRuntimeStatusByClone(vmRows, statuses)
	for _, id := range cloneIDs {
		if _, ok := byClone[id]; !ok {
			byClone[id] = clonedPodRuntimeStatus([]string{"missing"})
		}
	}
	return byClone, nil
}
