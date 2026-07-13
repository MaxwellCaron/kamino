package podnetwork

import (
	"fmt"
	"net/netip"
	"strings"
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
	VLANBase           int
	WorkloadAssignable bool
}

// Interface describes one router NIC attachment in a profile.
type Interface struct {
	Device     string
	SegmentKey string
	KeepUplink bool
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

// Config supplies deployment-specific VNet naming and VLAN bases.
type Config struct {
	VNetPrefix    string
	LANVLANBase   int
	DMZVNetPrefix string
	DMZVLANBase   int
	WANIPBase     string
}

// WorkloadAttachment is the resolved Proxmox attachment for a workload NIC.
type WorkloadAttachment struct {
	Device     string
	VNetName   string
	VNetTag    int
	VMVLANTag  *int
	SegmentKey string
}

// RouterAttachment is the resolved Proxmox attachment for a router NIC.
type RouterAttachment struct {
	Device     string
	Bridge     string
	VNetName   string
	VNetTag    int
	VMVLANTag  *int
	KeepUplink bool
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

// Catalog holds validated profile definitions.
type Catalog struct {
	config   Config
	profiles map[string]Profile
}

func NewCatalog(config Config) (*Catalog, error) {
	config.VNetPrefix = strings.TrimSpace(config.VNetPrefix)
	config.DMZVNetPrefix = strings.TrimSpace(config.DMZVNetPrefix)
	config.WANIPBase = strings.TrimSpace(config.WANIPBase)

	if config.VNetPrefix == "" {
		return nil, fmt.Errorf("pod VNet prefix is required")
	}
	if config.LANVLANBase < 0 || config.LANVLANBase > 4094 {
		return nil, fmt.Errorf("LAN VLAN base must be within 0..4094")
	}
	if config.DMZVNetPrefix == "" {
		return nil, fmt.Errorf("DMZ VNet prefix is required")
	}
	if config.DMZVLANBase < 0 || config.DMZVLANBase > 4094 {
		return nil, fmt.Errorf("DMZ VLAN base must be within 0..4094")
	}
	if config.WANIPBase == "" {
		return nil, fmt.Errorf("WAN IP base is required")
	}

	profiles := []Profile{
		buildLANRouterV1Profile(),
		buildLANDMZRouterV1Profile(),
	}

	catalog := &Catalog{
		config:   config,
		profiles: make(map[string]Profile, len(profiles)),
	}
	for _, profile := range profiles {
		if err := validateProfile(profile, config); err != nil {
			return nil, fmt.Errorf("profile %s: %w", profile.Key, err)
		}
		catalog.profiles[profile.Key] = profile
	}

	return catalog, nil
}
