package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
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

	tag, err := h.NetworkCatalog.InnerVLANTag(networkNumber)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	response := clonedPodNetworkResponse{
		Number:          networkNumber,
		VNet:            h.RouterCloneConfig.LANVNet,
		ExternalSubnet:  fmt.Sprintf("%s%d.0/24", wanBase, networkNumber),
		ExternalGateway: fmt.Sprintf("%s%d.1", wanBase, networkNumber),
		ProfileKey:      profileKey,
	}

	for _, segment := range profile.Segments {
		vnetName, err := h.NetworkCatalog.VNetName(segment.VNetKind)
		if err != nil {
			return clonedPodNetworkResponse{}, err
		}

		segmentResponse := podNetworkSegmentResponse{
			Key:     segment.Key,
			Subnet:  segment.Subnet.String(),
			Gateway: segment.Gateway.String(),
			VNet:    vnetName,
			VLANTag: tag,
		}
		response.Segments = append(response.Segments, segmentResponse)

		switch segment.Key {
		case podnetwork.SegmentLAN:
			response.InternalSubnet = segment.Subnet.String()
			response.InternalGateway = segment.Gateway.String()
			response.LANVLANTag = tag
		case podnetwork.SegmentDMZ:
			response.DMZVNet = vnetName
			response.DMZSubnet = segment.Subnet.String()
			response.DMZGateway = segment.Gateway.String()
			response.DMZVLANTag = tag
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

func (h *PodsHandler) sharedVNetIDs() []string {
	seen := make(map[string]struct{}, 3)
	ids := make([]string, 0, 3)
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	add(h.RouterCloneConfig.LANVNet)
	add(h.RouterCloneConfig.DMZVNet)
	add(h.RouterCloneConfig.PersonalVNet)
	return ids
}

func (h *PodsHandler) ensureSharedVNetsValid(ctx context.Context, required []string) *requestError {
	vnets, err := h.PX.GetVNets(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load shared pod networks",
			Operation:   "list shared pod VNets",
			Err:         err,
		}
	}

	available := make(map[string]proxmox.VNet, len(vnets))
	for _, vnet := range vnets {
		available[vnet.VNet] = vnet
	}

	requiredSet := make(map[string]struct{}, len(required))
	for _, name := range required {
		requiredSet[name] = struct{}{}
	}

	names := make(map[string]struct{}, len(required)+3)
	for _, name := range required {
		names[strings.TrimSpace(name)] = struct{}{}
	}
	for _, name := range h.sharedVNetIDs() {
		names[name] = struct{}{}
	}

	resolved := make(map[string]proxmox.VNet, len(names))
	for name := range names {
		if name == "" {
			continue
		}
		vnet, ok := available[name]
		if !ok {
			if _, isRequired := requiredSet[name]; isRequired {
				return &requestError{
					Status:      http.StatusBadGateway,
					UserMessage: fmt.Sprintf("required shared VNet %s is not available in Proxmox", name),
				}
			}
			continue
		}
		if !bool(vnet.VLANAware) {
			if _, isRequired := requiredSet[name]; isRequired {
				return &requestError{
					Status:      http.StatusConflict,
					UserMessage: fmt.Sprintf("shared VNet %s must be VLAN-aware", name),
				}
			}
			continue
		}
		if bool(vnet.IsolatePorts) {
			if _, isRequired := requiredSet[name]; isRequired {
				return &requestError{
					Status:      http.StatusConflict,
					UserMessage: fmt.Sprintf("shared VNet %s must not be port-isolated", name),
				}
			}
			continue
		}
		resolved[name] = vnet
	}

	for name := range requiredSet {
		if _, ok := resolved[name]; !ok {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: fmt.Sprintf("required shared VNet %s is not available in Proxmox", name),
			}
		}
	}

	seenTags := make(map[int]string, len(resolved))
	for name, vnet := range resolved {
		if existing, ok := seenTags[vnet.Tag]; ok {
			return &requestError{
				Status: http.StatusConflict,
				UserMessage: fmt.Sprintf(
					"shared VNets %s and %s must not share outer VLAN tag %d on the same physical bridge",
					existing, name, vnet.Tag,
				),
			}
		}
		seenTags[vnet.Tag] = name
	}

	return nil
}

func (h *PodsHandler) ensureProfileVNetsExist(ctx context.Context, profileKey string) *requestError {
	if h.NetworkCatalog == nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	required, err := h.NetworkCatalog.RequiredVNets(profileKey)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	return h.ensureSharedVNetsValid(ctx, required)
}
