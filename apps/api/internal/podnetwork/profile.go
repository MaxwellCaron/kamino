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
	LinkDown   bool
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
	LinkDown   bool
	SegmentKey string
}

// RouterAttachment is the resolved Proxmox attachment for a router NIC.
type RouterAttachment struct {
	Device     string
	Bridge     string
	VNetName   string
	VNetTag    int
	VMVLANTag  *int
	LinkDown   bool
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

func (c *Catalog) Profile(key string) (Profile, error) {
	profile, ok := c.profiles[key]
	if !ok {
		return Profile{}, fmt.Errorf("unknown network profile %q", key)
	}
	return copyProfile(profile), nil
}

func (c *Catalog) PublicProfiles() []PublicProfile {
	keys := []string{ProfileLANRouterV1, ProfileLANDMZRouterV1}
	result := make([]PublicProfile, 0, len(keys))
	for _, key := range keys {
		profile := c.profiles[key]
		public := PublicProfile{
			Key:                 profile.Key,
			Label:               profile.Label,
			Description:         profile.Description,
			DefaultSegmentKey:   profile.DefaultSegmentKey,
			Segments:            make([]PublicSegment, 0, len(profile.Segments)),
			PrefixNATSegmentKey: profile.PrefixNAT.SegmentKey,
		}
		for _, segment := range profile.Segments {
			if !segment.WorkloadAssignable {
				continue
			}
			public.Segments = append(public.Segments, PublicSegment{
				Key:   segment.Key,
				Label: segment.Label,
			})
		}
		result = append(result, public)
	}
	return result
}

func (c *Catalog) VNetName(kind string, networkNumber int32) (string, error) {
	if networkNumber < 1 || networkNumber > 4094 {
		return "", fmt.Errorf("network number %d is out of range", networkNumber)
	}
	switch kind {
	case VNetKindPrimary:
		return fmt.Sprintf("%s%d", c.config.VNetPrefix, c.config.LANVLANBase+int(networkNumber)), nil
	case VNetKindDMZ:
		return fmt.Sprintf("%s%d", c.config.DMZVNetPrefix, c.config.DMZVLANBase+int(networkNumber)), nil
	default:
		return "", fmt.Errorf("unknown VNet kind %q", kind)
	}
}

func (c *Catalog) VNetTag(kind string, networkNumber int32) (int, error) {
	if networkNumber < 1 || networkNumber > 4094 {
		return 0, fmt.Errorf("network number %d is out of range", networkNumber)
	}
	switch kind {
	case VNetKindPrimary:
		tag := c.config.LANVLANBase + int(networkNumber)
		if tag < 1 || tag > 4094 {
			return 0, fmt.Errorf("derived LAN VLAN tag %d is out of range", tag)
		}
		return tag, nil
	case VNetKindDMZ:
		tag := c.config.DMZVLANBase + int(networkNumber)
		if tag < 1 || tag > 4094 {
			return 0, fmt.Errorf("derived DMZ VLAN tag %d is out of range", tag)
		}
		return tag, nil
	default:
		return 0, fmt.Errorf("unknown VNet kind %q", kind)
	}
}

func (c *Catalog) RequiredVNets(profileKey string, networkNumber int32) ([]string, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(profile.RequiredVNets))
	names := make([]string, 0, len(profile.RequiredVNets))
	for _, kind := range profile.RequiredVNets {
		name, err := c.VNetName(kind, networkNumber)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names, nil
}

func (c *Catalog) ResolveWorkloadAttachment(
	profileKey string,
	networkNumber int32,
	segmentKey string,
) (WorkloadAttachment, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return WorkloadAttachment{}, err
	}

	segment, ok := findSegment(profile, segmentKey)
	if !ok {
		return WorkloadAttachment{}, fmt.Errorf("unknown segment %q for profile %q", segmentKey, profileKey)
	}
	if !segment.WorkloadAssignable {
		return WorkloadAttachment{}, fmt.Errorf("segment %q is not workload-assignable", segmentKey)
	}

	vnetName, err := c.VNetName(segment.VNetKind, networkNumber)
	if err != nil {
		return WorkloadAttachment{}, err
	}
	vnetTag, err := c.VNetTag(segment.VNetKind, networkNumber)
	if err != nil {
		return WorkloadAttachment{}, err
	}

	return WorkloadAttachment{
		Device:     "net0",
		VNetName:   vnetName,
		VNetTag:    vnetTag,
		VMVLANTag:  nil,
		LinkDown:   false,
		SegmentKey: segmentKey,
	}, nil
}

func (c *Catalog) ResolveRouterAttachments(
	profileKey string,
	networkNumber int32,
	wanBridge string,
) ([]RouterAttachment, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return nil, err
	}

	wanBridge = strings.TrimSpace(wanBridge)
	if wanBridge == "" {
		return nil, fmt.Errorf("WAN bridge is required")
	}

	attachments := make([]RouterAttachment, 0, len(profile.RouterInterfaces))
	for _, iface := range profile.RouterInterfaces {
		attachment := RouterAttachment{
			Device:     iface.Device,
			LinkDown:   iface.LinkDown,
			KeepUplink: iface.KeepUplink,
		}

		switch {
		case iface.KeepUplink:
			attachment.Bridge = wanBridge
		case iface.LinkDown:
			attachment.Bridge = wanBridge
		default:
			segment, ok := findSegment(profile, iface.SegmentKey)
			if !ok {
				return nil, fmt.Errorf("router interface %s references unknown segment %q", iface.Device, iface.SegmentKey)
			}
			vnetName, err := c.VNetName(segment.VNetKind, networkNumber)
			if err != nil {
				return nil, err
			}
			vnetTag, err := c.VNetTag(segment.VNetKind, networkNumber)
			if err != nil {
				return nil, err
			}
			attachment.VNetName = vnetName
			attachment.VNetTag = vnetTag
			attachment.Bridge = vnetName
			attachment.VMVLANTag = nil
		}

		attachments = append(attachments, attachment)
	}

	return attachments, nil
}

func (c *Catalog) ValidateAssignments(profileKey string, routerCount int, workloadSegments map[string]string) error {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return err
	}

	if routerCount != 1 {
		return fmt.Errorf("profile %s requires exactly one router", profileKey)
	}

	assignable := make(map[string]struct{})
	for _, segment := range profile.Segments {
		if segment.WorkloadAssignable {
			assignable[segment.Key] = struct{}{}
		}
	}

	if profile.Key == ProfileLANDMZRouterV1 {
		if len(workloadSegments) == 0 {
			return fmt.Errorf("profile %s requires an explicit segment for every workload", profileKey)
		}
		for vmName, segmentKey := range workloadSegments {
			segmentKey = strings.TrimSpace(segmentKey)
			if segmentKey == "" {
				return fmt.Errorf("workload %s is missing segment_key", vmName)
			}
			if _, ok := assignable[segmentKey]; !ok {
				return fmt.Errorf("workload %s has unknown segment %q", vmName, segmentKey)
			}
		}
		return nil
	}

	for vmName, segmentKey := range workloadSegments {
		segmentKey = strings.TrimSpace(segmentKey)
		if segmentKey == "" {
			if profile.DefaultSegmentKey == "" {
				return fmt.Errorf("workload %s is missing segment_key", vmName)
			}
			continue
		}
		if segmentKey != profile.DefaultSegmentKey {
			return fmt.Errorf("workload %s has unsupported segment %q", vmName, segmentKey)
		}
	}

	return nil
}

func (c *Catalog) DefaultWorkloadSegment(profileKey string) (string, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return "", err
	}
	if profile.DefaultSegmentKey == "" {
		return "", fmt.Errorf("profile %s has no default segment", profileKey)
	}
	return profile.DefaultSegmentKey, nil
}

func buildLANRouterV1Profile() Profile {
	lanSubnet := netip.MustParsePrefix("192.168.1.0/24")
	lanGateway := netip.MustParseAddr("192.168.1.1")

	return Profile{
		Key:               ProfileLANRouterV1,
		Label:             "LAN Router",
		Description:       "Add one VyOS router with host-preserving 1:1 NAT into an isolated 192.168.1.0/24 LAN.",
		RequiredVNets:     []string{VNetKindPrimary},
		DefaultSegmentKey: SegmentLAN,
		RouterInterfaces: []Interface{
			{Device: "net0", KeepUplink: true},
			{Device: "net1", SegmentKey: SegmentLAN},
			{Device: "net2", LinkDown: true, KeepUplink: true},
		},
		Segments: []Segment{
			{
				Key:                SegmentLAN,
				Label:              "LAN",
				Subnet:             lanSubnet,
				Gateway:            lanGateway,
				VNetKind:           VNetKindPrimary,
				VLANBase:           0,
				WorkloadAssignable: true,
			},
		},
		PrefixNAT: &PrefixNAT{SegmentKey: SegmentLAN},
	}
}

func buildLANDMZRouterV1Profile() Profile {
	lanSubnet := netip.MustParsePrefix("192.168.1.0/24")
	lanGateway := netip.MustParseAddr("192.168.1.1")
	dmzSubnet := netip.MustParsePrefix("10.0.50.0/24")
	dmzGateway := netip.MustParseAddr("10.0.50.1")

	return Profile{
		Key:               ProfileLANDMZRouterV1,
		Label:             "LAN + DMZ Router",
		Description:       "Add one VyOS router, an isolated 192.168.1.0/24 network, and a 10.0.50.0/24 DMZ network.",
		RequiredVNets:     []string{VNetKindPrimary, VNetKindDMZ},
		DefaultSegmentKey: SegmentLAN,
		RouterInterfaces: []Interface{
			{Device: "net0", KeepUplink: true},
			{Device: "net1", SegmentKey: SegmentLAN},
			{Device: "net2", SegmentKey: SegmentDMZ},
		},
		Segments: []Segment{
			{
				Key:                SegmentLAN,
				Label:              "LAN",
				Subnet:             lanSubnet,
				Gateway:            lanGateway,
				VNetKind:           VNetKindPrimary,
				VLANBase:           0,
				WorkloadAssignable: true,
			},
			{
				Key:                SegmentDMZ,
				Label:              "DMZ",
				Subnet:             dmzSubnet,
				Gateway:            dmzGateway,
				VNetKind:           VNetKindDMZ,
				VLANBase:           1000,
				WorkloadAssignable: true,
			},
		},
		PrefixNAT: &PrefixNAT{SegmentKey: SegmentDMZ},
	}
}

func validateProfile(profile Profile, config Config) error {
	if strings.TrimSpace(profile.Key) == "" {
		return fmt.Errorf("profile key is required")
	}

	segmentKeys := make(map[string]struct{})
	vnetKinds := make(map[string]struct{})
	for _, segment := range profile.Segments {
		if strings.TrimSpace(segment.Key) == "" {
			return fmt.Errorf("segment key is required")
		}
		if _, ok := segmentKeys[segment.Key]; ok {
			return fmt.Errorf("duplicate segment key %q", segment.Key)
		}
		segmentKeys[segment.Key] = struct{}{}

		if segment.Subnet.Bits() != 24 || !segment.Subnet.Addr().Is4() {
			return fmt.Errorf("segment %s must use a canonical IPv4 /24", segment.Key)
		}
		if segment.Subnet.Masked() != segment.Subnet {
			return fmt.Errorf("segment %s subnet must be a network address", segment.Key)
		}
		if !segment.Subnet.Contains(segment.Gateway) {
			return fmt.Errorf("segment %s gateway is not in subnet", segment.Key)
		}
		if _, ok := vnetKinds[segment.VNetKind]; ok {
			return fmt.Errorf("duplicate VNet kind %q", segment.VNetKind)
		}
		vnetKinds[segment.VNetKind] = struct{}{}

		for network := int32(1); network <= 254; network++ {
			tag := config.LANVLANBase + int(network)
			if segment.VNetKind == VNetKindDMZ {
				tag = config.DMZVLANBase + int(network)
			}
			if tag < 1 || tag > 4094 {
				return fmt.Errorf("segment %s VLAN tag %d is out of range", segment.Key, tag)
			}
			name, err := vnetNameForKind(config, segment.VNetKind, network)
			if err != nil {
				return err
			}
			if len(name) > 8 {
				return fmt.Errorf("derived VNet name %q exceeds eight characters", name)
			}
		}
	}

	deviceKeys := make(map[string]struct{})
	for _, iface := range profile.RouterInterfaces {
		if strings.TrimSpace(iface.Device) == "" {
			return fmt.Errorf("router interface device is required")
		}
		if _, ok := deviceKeys[iface.Device]; ok {
			return fmt.Errorf("duplicate router interface %q", iface.Device)
		}
		deviceKeys[iface.Device] = struct{}{}
		if iface.SegmentKey != "" {
			if _, ok := segmentKeys[iface.SegmentKey]; !ok {
				return fmt.Errorf("router interface %s references unknown segment %q", iface.Device, iface.SegmentKey)
			}
		}
	}

	if profile.PrefixNAT == nil {
		return fmt.Errorf("prefix NAT segment is required")
	}
	natSegment, ok := findSegment(profile, profile.PrefixNAT.SegmentKey)
	if !ok {
		return fmt.Errorf("prefix NAT references unknown segment %q", profile.PrefixNAT.SegmentKey)
	}
	if natSegment.Subnet.Bits() != 24 {
		return fmt.Errorf("prefix NAT segment must use /24")
	}

	if profile.DefaultSegmentKey != "" {
		if _, ok := segmentKeys[profile.DefaultSegmentKey]; !ok {
			return fmt.Errorf("default segment %q is unknown", profile.DefaultSegmentKey)
		}
	}

	return nil
}

func vnetNameForKind(config Config, kind string, networkNumber int32) (string, error) {
	switch kind {
	case VNetKindPrimary:
		return fmt.Sprintf("%s%d", config.VNetPrefix, config.LANVLANBase+int(networkNumber)), nil
	case VNetKindDMZ:
		return fmt.Sprintf("%s%d", config.DMZVNetPrefix, config.DMZVLANBase+int(networkNumber)), nil
	default:
		return "", fmt.Errorf("unknown VNet kind %q", kind)
	}
}

func findSegment(profile Profile, key string) (Segment, bool) {
	for _, segment := range profile.Segments {
		if segment.Key == key {
			return segment, true
		}
	}
	return Segment{}, false
}

func copyProfile(profile Profile) Profile {
	copied := profile
	copied.RequiredVNets = append([]string(nil), profile.RequiredVNets...)
	copied.RouterInterfaces = append([]Interface(nil), profile.RouterInterfaces...)
	copied.Segments = append([]Segment(nil), profile.Segments...)
	if profile.PrefixNAT != nil {
		prefixNAT := *profile.PrefixNAT
		copied.PrefixNAT = &prefixNAT
	}
	return copied
}
