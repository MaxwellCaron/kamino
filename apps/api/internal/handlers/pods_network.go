package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

type podDevVMNetworkAssignment struct {
	InventoryItemID uuid.UUID
	IsRouter        bool
	SegmentKey      *string
}

type podNetworkTopology struct {
	ProfileKey    string
	NetworkNumber int32
	Assignments   []podDevVMNetworkAssignment
}

type prefixNATResponse struct {
	External string `json:"external"`
	Internal string `json:"internal"`
}

type podNetworkSegmentResponse struct {
	Key     string `json:"key"`
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
	VNet    string `json:"vnet"`
	VLANTag int    `json:"vlan_tag"`
}

func (h *PodsHandler) buildPodNetworkMetadata(profileKey string, networkNumber int32) (clonedPodNetworkResponse, error) {
	if h.NetworkCatalog == nil {
		return clonedPodNetworkResponse{}, fmt.Errorf("network catalog is not configured")
	}

	profile, err := h.NetworkCatalog.Profile(profileKey)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	wanBase, err := normalizeWANIPBase(h.RouterCloneConfig.WANIPBase)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	response := clonedPodNetworkResponse{
		Number:          networkNumber,
		VNet:            h.podVNetName(networkNumber),
		ExternalSubnet:  fmt.Sprintf("%s%d.0/24", wanBase, networkNumber),
		ExternalGateway: fmt.Sprintf("%s%d.1", wanBase, networkNumber),
		ProfileKey:      profileKey,
	}

	for _, segment := range profile.Segments {
		vnetName, err := h.NetworkCatalog.VNetName(segment.VNetKind, networkNumber)
		if err != nil {
			return clonedPodNetworkResponse{}, err
		}
		vnetTag, err := h.NetworkCatalog.VNetTag(segment.VNetKind, networkNumber)
		if err != nil {
			return clonedPodNetworkResponse{}, err
		}

		segmentResponse := podNetworkSegmentResponse{
			Key:     segment.Key,
			Subnet:  segment.Subnet.String(),
			Gateway: segment.Gateway.String(),
			VNet:    vnetName,
			VLANTag: vnetTag,
		}
		response.Segments = append(response.Segments, segmentResponse)

		switch segment.Key {
		case podnetwork.SegmentLAN:
			response.InternalSubnet = segment.Subnet.String()
			response.InternalGateway = segment.Gateway.String()
			response.LANVLANTag = vnetTag
		case podnetwork.SegmentDMZ:
			response.DMZVNet = vnetName
			response.DMZSubnet = segment.Subnet.String()
			response.DMZGateway = segment.Gateway.String()
			response.DMZVLANTag = vnetTag
		}
	}

	if profile.PrefixNAT != nil {
		for _, segment := range profile.Segments {
			if segment.Key == profile.PrefixNAT.SegmentKey {
				response.PrefixNAT = &prefixNATResponse{
					External: response.ExternalSubnet,
					Internal: segment.Subnet.String(),
				}
				break
			}
		}
		if response.PrefixNAT == nil {
			return clonedPodNetworkResponse{}, fmt.Errorf("profile %s prefix NAT segment is missing", profileKey)
		}
	}

	return response, nil
}

func normalizeWANIPBase(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("WAN IP base is required")
	}
	if !strings.HasSuffix(trimmed, ".") {
		trimmed += "."
	}
	return trimmed, nil
}

func (h *PodsHandler) dmzVNetName(networkNumber int32) string {
	prefix := strings.TrimSpace(h.RouterCloneConfig.DMZVNetPrefix)
	if prefix == "" {
		prefix = "dmz"
	}
	return fmt.Sprintf("%s%d", prefix, h.RouterCloneConfig.DMZVLANBase+int(networkNumber))
}

func (h *PodsHandler) ensureProfileVNetsExist(ctx context.Context, profileKey string, networkNumber int32) *requestError {
	if h.NetworkCatalog == nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	required, err := h.NetworkCatalog.RequiredVNets(profileKey, networkNumber)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	vnets, err := h.PX.GetVNets(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load pod clone networks",
			Operation:   "list pod clone VNets",
			Err:         err,
		}
	}

	available := make(map[string]proxmox.VNet, len(vnets))
	for _, vnet := range vnets {
		available[vnet.VNet] = vnet
	}

	profile, err := h.NetworkCatalog.Profile(profileKey)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	for _, segment := range profile.Segments {
		if segment.VNetKind == "" {
			continue
		}
		vnetName, err := h.NetworkCatalog.VNetName(segment.VNetKind, networkNumber)
		if err != nil {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
			}
		}
		expectedTag, err := h.NetworkCatalog.VNetTag(segment.VNetKind, networkNumber)
		if err != nil {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
			}
		}

		vnet, ok := available[vnetName]
		if !ok {
			return &requestError{
				Status: http.StatusBadGateway,
				UserMessage: fmt.Sprintf(
					"required VNet %s (VLAN tag %d) is not available in Proxmox",
					vnetName,
					expectedTag,
				),
			}
		}
		if vnet.Tag != expectedTag {
			return &requestError{
				Status:      http.StatusConflict,
				UserMessage: fmt.Sprintf("VNet %s has tag %d, expected %d", vnetName, vnet.Tag, expectedTag),
			}
		}
	}

	for _, name := range required {
		if _, ok := available[name]; !ok {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: fmt.Sprintf("required VNet %s is not available in Proxmox", name),
			}
		}
	}

	return nil
}

func (h *PodsHandler) routerWANBridge(ctx context.Context, node string, vmid int) (string, *requestError) {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return "", &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load router network configuration",
			Operation:   "load router WAN bridge",
			Err:         err,
		}
	}

	for _, network := range config.Networks {
		if network.Device == "net0" {
			bridge := strings.TrimSpace(network.Bridge)
			if bridge == "" {
				return "", &requestError{
					Status:      http.StatusUnprocessableEntity,
					UserMessage: "router template net0 is missing a WAN bridge",
				}
			}
			return bridge, nil
		}
	}

	return "", &requestError{
		Status:      http.StatusUnprocessableEntity,
		UserMessage: "router template is missing net0",
	}
}

func (h *PodsHandler) routerHasManagedNIC(ctx context.Context, node string, vmid int, device string) (bool, *requestError) {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return false, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load router network configuration",
			Operation:   "load router hardware config",
			Err:         err,
		}
	}
	for _, network := range config.Networks {
		if network.Device == device {
			return true, nil
		}
	}
	return false, nil
}

func (h *PodsHandler) configureProfileNetworkAttachments(
	ctx context.Context,
	profileKey string,
	networkNumber int32,
	targets []podNetworkVMTarget,
	segmentByTarget map[string]string,
) *requestError {
	if h.NetworkCatalog == nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	router, reqErr := findPodNetworkRouterTargetByFlag(targets)
	if reqErr != nil {
		return reqErr
	}

	wanBridge, reqErr := h.routerWANBridge(ctx, router.clone.TargetNode, router.clone.VMID)
	if reqErr != nil {
		return reqErr
	}

	if profileKey == podnetwork.ProfileLANDMZRouterV1 {
		hasNet2, reqErr := h.routerHasManagedNIC(ctx, router.clone.TargetNode, router.clone.VMID, "net2")
		if reqErr != nil {
			return reqErr
		}
		if !hasNet2 {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "router template must expose net2 for the LAN + DMZ Router profile",
			}
		}
	}

	routerAttachments, err := h.NetworkCatalog.ResolveRouterAttachments(profileKey, networkNumber, wanBridge)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	for _, attachment := range routerAttachments {
		if err := h.PX.SetVMNetworkAttachment(ctx, router.clone.TargetNode, router.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
			Bridge:   attachment.Bridge,
			VLANTag:  attachment.VMVLANTag,
			LinkDown: attachment.LinkDown,
			Firewall: !attachment.LinkDown,
		}); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to configure cloned router network",
				Operation:   "set router network attachment",
				Err:         err,
			}
		}
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)
	for _, target := range targets {
		if target.router {
			continue
		}
		target := target
		segmentKey := segmentByTarget[target.name]
		if segmentKey == "" {
			segmentKey, err = h.NetworkCatalog.DefaultWorkloadSegment(profileKey)
			if err != nil {
				return &requestError{
					Status:      http.StatusUnprocessableEntity,
					UserMessage: err.Error(),
				}
			}
		}

		attachment, err := h.NetworkCatalog.ResolveWorkloadAttachment(profileKey, networkNumber, segmentKey)
		if err != nil {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
			}
		}

		group.Go(func() error {
			return h.PX.SetVMNetworkAttachment(gctx, target.clone.TargetNode, target.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
				Bridge:   attachment.VNetName,
				VLANTag:  attachment.VMVLANTag,
				LinkDown: attachment.LinkDown,
				Firewall: true,
			})
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned pod networks",
			Operation:   "set workload network attachments",
			Err:         err,
		}
	}

	return nil
}

func findPodNetworkRouterTargetByFlag(targets []podNetworkVMTarget) (*podNetworkVMTarget, *requestError) {
	var router *podNetworkVMTarget
	for index := range targets {
		if !targets[index].router {
			continue
		}
		if router != nil {
			return nil, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "pod must contain exactly one router virtual machine",
			}
		}
		router = &targets[index]
	}
	if router == nil {
		return nil, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "pod must contain exactly one router virtual machine",
		}
	}
	return router, nil
}

func buildRouterCloudInitConfigForProfile(
	networkNumber int32,
	profileKey string,
	config PodRouterCloneConfig,
) (*clonedRouterCloudInitConfig, error) {
	switch profileKey {
	case podnetwork.ProfileLANDMZRouterV1:
		storage := strings.TrimSpace(config.CloudInitStorage)
		if storage == "" {
			return nil, fmt.Errorf("router cloud-init storage is required")
		}
		userFile, err := formatClonedRouterCloudInitFile(config.LANDMZCloudInitUserFilePattern, networkNumber)
		if err != nil {
			return nil, fmt.Errorf("build DMZ/LAN router cloud-init user-data filename: %w", err)
		}
		networkFile := strings.TrimSpace(config.LANDMZCloudInitNetworkFile)
		if err := validateStaticCloudInitNetworkFile(networkFile); err != nil {
			return nil, err
		}
		return &clonedRouterCloudInitConfig{
			Storage:     storage,
			UserFile:    userFile,
			NetworkFile: networkFile,
		}, nil
	case podnetwork.ProfileLANRouterV1:
		return buildClonedRouterCloudInitConfig(networkNumber, config)
	default:
		return nil, fmt.Errorf("unsupported network profile %q", profileKey)
	}
}

func validateStaticCloudInitNetworkFile(filename string) error {
	if strings.Contains(filename, routerCloudInitNetworkPlaceholder) {
		return fmt.Errorf("router cloud-init network-config filename must not contain %s", routerCloudInitNetworkPlaceholder)
	}
	return routerconfig.ValidateCloudInitSnippetFilename(filename)
}

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
