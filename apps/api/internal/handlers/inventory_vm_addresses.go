package handlers

import (
	"context"
	"fmt"
	"net/netip"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/google/uuid"
)

type InventoryVMAddress struct {
	Label   string `json:"label"`
	Address string `json:"address"`
	Device  string `json:"device"`
}

type podVMAddressReader interface {
	ListPodVMAddressMetadata(ctx context.Context, inventoryItemIDs []uuid.UUID) ([]database.ListPodVMAddressMetadataRow, error)
}

var _ podVMAddressReader = (*database.Queries)(nil)

func (h *InventoryHandler) loadPodVMAddresses(
	ctx context.Context,
	itemIDs []uuid.UUID,
) (map[uuid.UUID][]InventoryVMAddress, error) {
	addressesByItemID := make(map[uuid.UUID][]InventoryVMAddress)
	if len(itemIDs) == 0 || h.PodVMAddressReader == nil || h.NetworkCatalog == nil {
		return addressesByItemID, nil
	}

	rows, err := h.PodVMAddressReader.ListPodVMAddressMetadata(ctx, itemIDs)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		addresses, err := resolveInventoryVMAddresses(h.NetworkCatalog, row)
		if err != nil || len(addresses) == 0 {
			continue
		}
		addressesByItemID[row.InventoryItemID] = addresses
	}

	return addressesByItemID, nil
}

func resolveInventoryVMAddresses(
	catalog *podnetwork.Catalog,
	metadata database.ListPodVMAddressMetadataRow,
) ([]InventoryVMAddress, error) {
	if metadata.NetworkProfileKey == nil || strings.TrimSpace(*metadata.NetworkProfileKey) == "" {
		return nil, fmt.Errorf("pod VM %s is missing its network profile", metadata.InventoryItemID)
	}

	profileKey := strings.TrimSpace(*metadata.NetworkProfileKey)
	profile, err := catalog.Profile(profileKey)
	if err != nil {
		return nil, err
	}
	target := podnetwork.Target{
		LANVNet:   metadata.LanVnet,
		DMZVNet:   derefString(metadata.DmzVnet),
		WANBridge: metadata.WanBridge,
		WANSubnet: metadata.WanSubnet,
	}

	var addresses []InventoryVMAddress
	if metadata.IsRouter {
		addresses, err = resolveRouterInventoryVMAddresses(profile, metadata)
	} else {
		addresses, err = resolveWorkloadInventoryVMAddresses(catalog, profile, target, metadata)
	}
	if err != nil {
		return nil, err
	}

	addressOrder := map[string]int{"WAN": 0, "DMZ": 1, "LAN": 2}
	sort.SliceStable(addresses, func(i, j int) bool {
		return addressOrder[addresses[i].Label] < addressOrder[addresses[j].Label]
	})
	return addresses, nil
}

func resolveRouterInventoryVMAddresses(
	profile podnetwork.Profile,
	metadata database.ListPodVMAddressMetadataRow,
) ([]InventoryVMAddress, error) {
	wanSubnet, err := routerconfig.PodWANSubnet(metadata.WanSubnet, metadata.NetworkNumber)
	if err != nil {
		return nil, err
	}

	addresses := make([]InventoryVMAddress, 0, len(profile.RouterInterfaces))
	for _, networkInterface := range profile.RouterInterfaces {
		if networkInterface.Uplink {
			addresses = append(addresses, InventoryVMAddress{
				Label:   "WAN",
				Address: wanSubnet.Addr().Next().String(),
				Device:  networkInterface.Device,
			})
			continue
		}

		segment, ok := inventoryVMAddressSegment(profile, networkInterface.SegmentKey)
		if !ok {
			return nil, fmt.Errorf("router interface %s references unknown segment %q", networkInterface.Device, networkInterface.SegmentKey)
		}
		addresses = append(addresses, InventoryVMAddress{
			Label:   segment.Label,
			Address: segment.Gateway.String(),
			Device:  networkInterface.Device,
		})
	}
	return addresses, nil
}

func resolveWorkloadInventoryVMAddresses(
	catalog *podnetwork.Catalog,
	profile podnetwork.Profile,
	target podnetwork.Target,
	metadata database.ListPodVMAddressMetadataRow,
) ([]InventoryVMAddress, error) {
	if metadata.SegmentKey == nil || metadata.HostOctet == nil {
		return nil, nil
	}

	segmentKey := strings.TrimSpace(*metadata.SegmentKey)
	segment, ok := inventoryVMAddressSegment(profile, segmentKey)
	if !ok {
		return nil, fmt.Errorf("workload references unknown segment %q", segmentKey)
	}
	attachment, err := catalog.ResolveWorkloadAttachment(
		target,
		profile.Key,
		metadata.NetworkNumber,
		segmentKey,
	)
	if err != nil {
		return nil, err
	}

	internalAddress, err := inventoryVMHostAddress(segment.Subnet, *metadata.HostOctet)
	if err != nil {
		return nil, err
	}
	addresses := []InventoryVMAddress{{
		Label:   segment.Label,
		Address: internalAddress,
		Device:  attachment.Device,
	}}

	if profile.PrefixNAT != nil && profile.PrefixNAT.SegmentKey == segmentKey {
		wanSubnet, err := routerconfig.PodWANSubnet(metadata.WanSubnet, metadata.NetworkNumber)
		if err != nil {
			return nil, err
		}
		externalAddress, err := inventoryVMHostAddress(wanSubnet, *metadata.HostOctet)
		if err != nil {
			return nil, err
		}
		addresses = append(addresses, InventoryVMAddress{
			Label:   "WAN",
			Address: externalAddress,
			Device:  attachment.Device,
		})
	}

	return addresses, nil
}

func inventoryVMAddressSegment(profile podnetwork.Profile, key string) (podnetwork.Segment, bool) {
	for _, segment := range profile.Segments {
		if segment.Key == key {
			return segment, true
		}
	}
	return podnetwork.Segment{}, false
}

func inventoryVMHostAddress(subnet netip.Prefix, hostOctet int32) (string, error) {
	if !subnet.Addr().Is4() || subnet.Bits() != 24 || hostOctet < 1 || hostOctet > 254 {
		return "", fmt.Errorf("cannot resolve host %d in subnet %s", hostOctet, subnet)
	}

	octets := subnet.Addr().As4()
	octets[3] = byte(hostOctet)
	return netip.AddrFrom4(octets).String(), nil
}
