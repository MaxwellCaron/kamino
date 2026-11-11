package pods

import (
	"context"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/google/uuid"
)

func clonedPodVMResponseFromRow(
	row database.ListClonedPodVMsRow,
	status string,
	resource vmstatus.VMResources,
	uptime *int64,
) clonedPodVMResponse {
	return clonedPodVMResponse{
		ID:         row.InventoryItemID,
		Name:       row.Name,
		Status:     status,
		Resources:  resource,
		Uptime:     uptime,
		CPUCount:   row.CpuCount,
		MemoryMB:   row.MemoryMb,
		DiskGB:     row.DiskGb,
		HostOctet:  row.HostOctet,
		IsRouter:   row.IsRouter,
		SegmentKey: row.SegmentKey,
		Inventory: clonedPodVMInventoryResponse{
			ItemID: row.InventoryItemID,
		},
	}
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

	principals, err := q.ListPrincipalDetailsByIDs(ctx, []uuid.UUID{clone.UserPrincipalID})
	if err != nil {
		return clonedPodResponse{}, err
	}
	if len(principals) == 0 {
		return clonedPodResponse{}, fmt.Errorf("clone owner principal not found")
	}
	owner := cloneOwnerFromPrincipal(principals[0])

	network, err := h.clonedPodNetworkMetadata(ctx, clone)
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

		response = append(response, clonedPodVMResponseFromRow(row, status, resource, uptime))
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
