package podnetwork

import (
	"fmt"
	"strings"
)

func validateProfile(profile Profile) error {
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

		if !knownVNetKind(segment.VNetKind) {
			return fmt.Errorf("unknown VNet kind %q", segment.VNetKind)
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

func knownVNetKind(kind string) bool {
	return kind == VNetKindPrimary || kind == VNetKindDMZ
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
