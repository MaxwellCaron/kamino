package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type publishNetworkAssignment struct {
	IsRouter   bool
	SegmentKey *string
}

func (h *PodsHandler) validatePublishablePodNetwork(
	ctx context.Context,
	podFolderID uuid.UUID,
	folderVMs []publishPodVMOption,
) (string, map[uuid.UUID]publishNetworkAssignment, *requestError) {
	topology, err := h.loadDevNetworkTopology(ctx, podFolderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, invalidPublishPod("selected Pod Folder does not have automated networking metadata")
		}
		return "", nil, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load pod network metadata",
			Operation:   "load pod dev network topology",
			Err:         err,
		}
	}

	assignmentByItem := make(map[uuid.UUID]publishNetworkAssignment, len(topology.Assignments))
	routerCount := 0
	for _, assignment := range topology.Assignments {
		assignmentByItem[assignment.InventoryItemID] = publishNetworkAssignment{
			IsRouter:   assignment.IsRouter,
			SegmentKey: assignment.SegmentKey,
		}
		if assignment.IsRouter {
			routerCount++
			continue
		}
		if assignment.SegmentKey == nil || strings.TrimSpace(*assignment.SegmentKey) == "" {
			return "", nil, invalidPublishPod("pod workload is missing a network segment assignment")
		}
	}

	if routerCount != 1 {
		return "", nil, invalidPublishPod("pod must contain exactly one router for automated publishing")
	}

	if err := h.NetworkCatalog.ValidateAssignments(
		topology.ProfileKey,
		routerCount,
		segmentAssignmentsForPublish(folderVMs, assignmentByItem),
	); err != nil {
		return "", nil, invalidPublishPod(err.Error())
	}

	return topology.ProfileKey, assignmentByItem, nil
}

func segmentAssignmentsForPublish(
	folderVMs []publishPodVMOption,
	assignmentByItem map[uuid.UUID]publishNetworkAssignment,
) map[string]string {
	assignments := make(map[string]string)
	for _, vm := range folderVMs {
		assignment, ok := assignmentByItem[vm.ID]
		if !ok || assignment.IsRouter {
			continue
		}
		if assignment.SegmentKey != nil {
			assignments[vm.Name] = *assignment.SegmentKey
		}
	}
	return assignments
}

func applyPublishNetworkAssignments(
	vms []normalizedPublishPodVM,
	assignmentByItem map[uuid.UUID]publishNetworkAssignment,
) ([]normalizedPublishPodVM, *requestError) {
	for index := range vms {
		assignment, ok := assignmentByItem[vms[index].RequestInventoryItemID]
		if !ok {
			return nil, invalidPublishPod("published VM is missing stored network assignment metadata")
		}
		vms[index].IsRouter = assignment.IsRouter
		vms[index].SegmentKey = assignment.SegmentKey
	}
	return vms, nil
}
