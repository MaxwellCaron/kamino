package handlers

import (
	"reflect"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
)

func TestResolveInventoryVMAddresses(t *testing.T) {
	catalog, err := podnetwork.NewCatalog()
	if err != nil {
		t.Fatalf("create network catalog: %v", err)
	}

	lanProfile := podnetwork.ProfileLANRouterV1
	dmzProfile := podnetwork.ProfileLANDMZRouterV1
	dmzSegment := podnetwork.SegmentDMZ
	hostOctet := int32(50)

	tests := []struct {
		name     string
		metadata database.ListPodVMAddressMetadataRow
		want     []InventoryVMAddress
	}{
		{
			name: "router exposes each configured interface address",
			metadata: database.ListPodVMAddressMetadataRow{
				InventoryItemID:   uuid.New(),
				NetworkNumber:     24,
				NetworkProfileKey: &lanProfile,
				LanVnet:           "pod2",
				WanBridge:         "vmbr0",
				WanSubnet:         "172.16.0.0/16",
				IsRouter:          true,
			},
			want: []InventoryVMAddress{
				{Label: "WAN", Address: "172.16.24.1", Device: "net0"},
				{Label: "LAN", Address: "192.168.1.1", Device: "net1"},
			},
		},
		{
			name: "prefix NAT workload exposes internal and external addresses",
			metadata: database.ListPodVMAddressMetadataRow{
				InventoryItemID:   uuid.New(),
				NetworkNumber:     24,
				NetworkProfileKey: &dmzProfile,
				LanVnet:           "pod2",
				DmzVnet:           new("pod3"),
				WanBridge:         "vmbr0",
				WanSubnet:         "172.16.0.0/16",
				SegmentKey:        &dmzSegment,
				HostOctet:         &hostOctet,
			},
			want: []InventoryVMAddress{
				{Label: "WAN", Address: "172.16.24.50", Device: "net0"},
				{Label: "DMZ", Address: "10.0.50.50", Device: "net0"},
			},
		},
		{
			name: "workload without a host octet has no derived address",
			metadata: database.ListPodVMAddressMetadataRow{
				InventoryItemID:   uuid.New(),
				NetworkNumber:     24,
				NetworkProfileKey: &dmzProfile,
				LanVnet:           "pod2",
				DmzVnet:           new("pod3"),
				WanBridge:         "vmbr0",
				WanSubnet:         "172.16.0.0/16",
				SegmentKey:        &dmzSegment,
			},
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveInventoryVMAddresses(catalog, tt.metadata)
			if err != nil {
				t.Fatalf("resolve addresses: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("addresses = %#v, want %#v", got, tt.want)
			}
		})
	}
}
