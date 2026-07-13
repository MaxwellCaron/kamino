package podnetwork

import (
	"net/netip"
)

func buildLANRouterV1Profile() Profile {
	lanSubnet := netip.MustParsePrefix("192.168.1.0/24")
	lanGateway := netip.MustParseAddr("192.168.1.1")

	return Profile{
		Key:               ProfileLANRouterV1,
		Label:             "LAN Router",
		Description:       "1:1 NAT into an isolated 192.168.1.0/24 LAN.",
		RequiredVNets:     []string{VNetKindPrimary},
		DefaultSegmentKey: SegmentLAN,
		RouterInterfaces: []Interface{
			{Device: "net0", KeepUplink: true},
			{Device: "net1", SegmentKey: SegmentLAN},
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
		Description:       "1:1 NAT into a 10.0.50.0/24 DMZ network in addition to an isolated 192.168.1.0/24 network.",
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
