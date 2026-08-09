package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/google/uuid"
)

type podDevVMNetworkAssignment struct {
	InventoryItemID uuid.UUID
	IsRouter        bool
	SegmentKey      *string
}

type podNetworkTopology struct {
	ProfileKey     string
	CloneTargetKey string
	NetworkNumber  int32
	Assignments    []podDevVMNetworkAssignment
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

func (h *PodsHandler) buildPodNetworkMetadata(
	target podCloneTarget,
	profileKey string,
	networkNumber int32,
) (clonedPodNetworkResponse, error) {
	if h.NetworkCatalog == nil {
		return clonedPodNetworkResponse{}, fmt.Errorf("network catalog is not configured")
	}

	profile, err := h.NetworkCatalog.Profile(profileKey)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	wanSubnet, err := routerconfig.PodWANSubnet(target.WANSubnet, networkNumber)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	tag, err := h.NetworkCatalog.InnerVLANTag(networkNumber)
	if err != nil {
		return clonedPodNetworkResponse{}, err
	}

	response := clonedPodNetworkResponse{
		Number:          networkNumber,
		VNet:            target.LANVNet,
		ExternalSubnet:  wanSubnet.String(),
		ExternalGateway: wanSubnet.Addr().Next().String(),
		ProfileKey:      profileKey,
		CloneTargetKey:  target.Key,
		CloneTargetName: target.Label,
		WANBridge:       target.WANBridge,
	}

	for _, segment := range profile.Segments {
		vnetName, err := h.NetworkCatalog.VNetName(target.Network(), segment.VNetKind)
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

func (h *PodsHandler) ensureSharedVNetsValid(ctx context.Context, required []string) *requestError {
	return h.ensureVNetsValid(ctx, required, nil)
}

func (h *PodsHandler) ensureVNetsValid(ctx context.Context, required []string, alsoCheck []string) *requestError {
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

	names := make(map[string]struct{}, len(required)+len(alsoCheck))
	requiredSet := make(map[string]struct{}, len(required))
	for _, name := range required {
		if name = strings.TrimSpace(name); name != "" {
			requiredSet[name] = struct{}{}
			names[name] = struct{}{}
		}
	}
	for _, name := range alsoCheck {
		if name = strings.TrimSpace(name); name != "" {
			names[name] = struct{}{}
		}
	}

	resolved := make(map[string]proxmox.VNet, len(names))
	for name := range names {
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

func (h *PodsHandler) ensureProfileVNetsExist(
	ctx context.Context,
	target podCloneTarget,
	profileKey string,
) *requestError {
	if h.NetworkCatalog == nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	required, err := h.NetworkCatalog.RequiredVNets(target.Network(), profileKey)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	// Both VNets are checked even when the profile needs one: a colliding pair breaks every profile.
	return h.ensureVNetsValid(ctx, required, []string{target.LANVNet, target.DMZVNet})
}

func (h *PodsHandler) ensureCloneTargetVNetsValid(ctx context.Context, target podCloneTarget) *requestError {
	others, reqErr := h.listPodCloneTargets(ctx)
	if reqErr != nil {
		return reqErr
	}

	// Every other target, so a collision surfaces before the target is saved.
	alsoCheck := make([]string, 0, len(others)*2)
	for _, other := range others {
		if other.Key == target.Key {
			continue
		}
		alsoCheck = append(alsoCheck, other.LANVNet, other.DMZVNet)
	}

	return h.ensureVNetsValid(ctx, []string{target.LANVNet, target.DMZVNet}, alsoCheck)
}
