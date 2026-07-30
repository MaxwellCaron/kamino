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

// Config supplies the exact shared VNet IDs used by every managed pod
type Config struct {
	LANVNet   string
	DMZVNet   string
	WANIPBase string
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
	Device     string
	Bridge     string
	VNetName   string
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
	config.LANVNet = strings.TrimSpace(config.LANVNet)
	config.DMZVNet = strings.TrimSpace(config.DMZVNet)
	config.WANIPBase = strings.TrimSpace(config.WANIPBase)

	if err := validateSharedVNetID(config.LANVNet); err != nil {
		return nil, fmt.Errorf("LAN VNet: %w", err)
	}
	if err := validateSharedVNetID(config.DMZVNet); err != nil {
		return nil, fmt.Errorf("DMZ VNet: %w", err)
	}
	if config.LANVNet == config.DMZVNet {
		return nil, fmt.Errorf("LAN and DMZ VNet IDs must be distinct")
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
