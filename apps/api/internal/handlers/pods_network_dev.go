package handlers

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func (h *PodsHandler) persistDevNetworkAssignments(
	ctx context.Context,
	q *database.Queries,
	podFolderID uuid.UUID,
	targets []podNetworkVMTarget,
	segmentByTarget map[string]string,
) error {
	if err := q.DeletePodDevVMNetworkAssignments(ctx, podFolderID); err != nil {
		return err
	}

	for _, target := range targets {
		var segmentKey *string
		if !target.router {
			value := segmentByTarget[target.name]
			if value == "" {
				return fmt.Errorf("workload %s is missing segment assignment", target.name)
			}
			segmentKey = &value
		}

		if err := q.InsertPodDevVMNetworkAssignment(ctx, database.InsertPodDevVMNetworkAssignmentParams{
			InventoryItemID: target.clone.InventoryItemID,
			PodFolderID:     podFolderID,
			IsRouter:        target.router,
			SegmentKey:      segmentKey,
		}); err != nil {
			return err
		}
	}

	return nil
}

func (h *PodsHandler) loadDevNetworkTopology(ctx context.Context, podFolderID uuid.UUID) (*podNetworkTopology, error) {
	q := database.New(h.DB)

	allocation, err := q.GetPodDevNetworkAllocation(ctx, podFolderID)
	if err != nil {
		return nil, err
	}

	assignments, err := q.ListPodDevVMNetworkAssignments(ctx, podFolderID)
	if err != nil {
		return nil, err
	}

	topology := &podNetworkTopology{
		ProfileKey:    allocation.NetworkProfileKey,
		NetworkNumber: allocation.NetworkNumber,
		Assignments:   make([]podDevVMNetworkAssignment, 0, len(assignments)),
	}
	for _, row := range assignments {
		topology.Assignments = append(topology.Assignments, podDevVMNetworkAssignment{
			InventoryItemID: row.InventoryItemID,
			IsRouter:        row.IsRouter,
			SegmentKey:      row.SegmentKey,
		})
	}

	return topology, nil
}
