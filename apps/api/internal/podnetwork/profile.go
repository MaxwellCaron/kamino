package podnetwork

import (
	"fmt"
	"net/netip"
)

const (
	ProfileLANRouterV1    = "lan-router-v1"
	ProfileLANDMZRouterV1 = "lan-dmz-router-v1"

	SegmentLAN = "lan"
	SegmentDMZ = "dmz"

	VNetKindPrimary = "primary"
	VNetKindDMZ     = "dmz"
)

// Segment describes one isolated network segment in a profile.
type Segment struct {
	Key                string
	Label              string
	Subnet             netip.Prefix
	Gateway            netip.Addr
	VNetKind           string
	WorkloadAssignable bool
}

// Interface describes one router NIC attachment in a profile.
type Interface struct {
	Device     string
	SegmentKey string
	Uplink     bool
}

// PrefixNAT identifies the segment mapped host-for-host to the pod WAN /24.
type PrefixNAT struct {
	SegmentKey string
}

// Profile is an immutable versioned pod network definition.
type Profile struct {
	Key               string
	Label             string
	Description       string
	RequiredVNets     []string
	DefaultSegmentKey string
	RouterInterfaces  []Interface
	Segments          []Segment
	PrefixNAT         *PrefixNAT
}

// Target is one clone domain: shared VNets plus the WAN uplink and /16 subnet.
type Target struct {
	Key       string
	LANVNet   string
	DMZVNet   string
	WANBridge string
	WANSubnet string
}

// WorkloadAttachment is the resolved Proxmox attachment for a workload NIC.
type WorkloadAttachment struct {
	Device     string
	VNetName   string
	VMVLANTag  *int
	SegmentKey string
}

// RouterAttachment is the resolved Proxmox attachment for a router NIC.
type RouterAttachment struct {
	Device    string
	Bridge    string
	VNetName  string
	VMVLANTag *int
	Uplink    bool
}

// PublicProfile is returned by create options for the frontend.
type PublicProfile struct {
	Key                 string          `json:"key"`
	Label               string          `json:"label"`
	Description         string          `json:"description"`
	DefaultSegmentKey   string          `json:"default_segment_key,omitempty"`
	Segments            []PublicSegment `json:"segments"`
	PrefixNATSegmentKey string          `json:"prefix_nat_segment_key,omitempty"`
}

type PublicSegment struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// Catalog holds validated profile definitions; VNets come from the passed Target.
type Catalog struct {
	profiles map[string]Profile
}

func NewCatalog() (*Catalog, error) {
	profiles := []Profile{
		buildLANRouterV1Profile(),
		buildLANDMZRouterV1Profile(),
	}

	catalog := &Catalog{profiles: make(map[string]Profile, len(profiles))}
	for _, profile := range profiles {
		if err := validateProfile(profile); err != nil {
			return nil, fmt.Errorf("profile %s: %w", profile.Key, err)
		}
		catalog.profiles[profile.Key] = profile
	}

	return catalog, nil
}
