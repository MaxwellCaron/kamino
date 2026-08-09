package podnetwork

import (
	"fmt"
	"strings"
)

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

func (c *Catalog) VNetName(target Target, kind string) (string, error) {
	switch kind {
	case VNetKindPrimary:
		return target.LANVNet, nil
	case VNetKindDMZ:
		return target.DMZVNet, nil
	default:
		return "", fmt.Errorf("unknown VNet kind %q", kind)
	}
}

func (c *Catalog) InnerVLANTag(networkNumber int32) (int, error) {
	if networkNumber < 1 || networkNumber > 255 {
		return 0, fmt.Errorf("inner VLAN tag %d is out of range", networkNumber)
	}
	return int(networkNumber), nil
}

func (c *Catalog) RequiredVNets(target Target, profileKey string) ([]string, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(profile.RequiredVNets))
	names := make([]string, 0, len(profile.RequiredVNets))
	for _, kind := range profile.RequiredVNets {
		name, err := c.VNetName(target, kind)
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
	target Target,
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

	vnetName, err := c.VNetName(target, segment.VNetKind)
	if err != nil {
		return WorkloadAttachment{}, err
	}
	tag, err := c.InnerVLANTag(networkNumber)
	if err != nil {
		return WorkloadAttachment{}, err
	}

	return WorkloadAttachment{
		Device:     "net0",
		VNetName:   vnetName,
		VMVLANTag:  &tag,
		SegmentKey: segmentKey,
	}, nil
}

func (c *Catalog) ResolveRouterAttachments(
	target Target,
	profileKey string,
	networkNumber int32,
) ([]RouterAttachment, error) {
	profile, err := c.Profile(profileKey)
	if err != nil {
		return nil, err
	}

	wanBridge := strings.TrimSpace(target.WANBridge)
	if wanBridge == "" {
		return nil, fmt.Errorf("WAN bridge is required")
	}

	attachments := make([]RouterAttachment, 0, len(profile.RouterInterfaces))
	for _, iface := range profile.RouterInterfaces {
		attachment := RouterAttachment{
			Device: iface.Device,
			Uplink: iface.Uplink,
		}

		switch {
		case iface.Uplink:
			attachment.Bridge = wanBridge
		default:
			segment, ok := findSegment(profile, iface.SegmentKey)
			if !ok {
				return nil, fmt.Errorf("router interface %s references unknown segment %q", iface.Device, iface.SegmentKey)
			}
			vnetName, err := c.VNetName(target, segment.VNetKind)
			if err != nil {
				return nil, err
			}
			tag, err := c.InnerVLANTag(networkNumber)
			if err != nil {
				return nil, err
			}
			attachment.VNetName = vnetName
			attachment.Bridge = vnetName
			attachment.VMVLANTag = &tag
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
