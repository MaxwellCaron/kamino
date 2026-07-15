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
