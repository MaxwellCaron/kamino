package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

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
