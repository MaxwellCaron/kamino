package podnetwork

import (
	"reflect"
	"testing"
)

func TestCatalogPublicProfilesAndAttachments(t *testing.T) {
	catalog, err := NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	profiles := catalog.PublicProfiles()
	if len(profiles) != 2 || profiles[0].Key != ProfileLANRouterV1 || profiles[1].Key != ProfileLANDMZRouterV1 {
		t.Fatalf("unexpected public profiles %+v", profiles)
	}
	target := Target{LANVNet: "lablan", DMZVNet: "labdmz", WANBridge: "vmbr0"}
	for _, tc := range []struct {
		key           string
		vnets         []string
		routerDevices []string
	}{
		{ProfileLANRouterV1, []string{"lablan"}, []string{"net0", "net1"}},
		{ProfileLANDMZRouterV1, []string{"lablan", "labdmz"}, []string{"net0", "net1", "net2"}},
	} {
		t.Run(tc.key, func(t *testing.T) {
			vnets, err := catalog.RequiredVNets(target, tc.key)
			if err != nil || !reflect.DeepEqual(vnets, tc.vnets) {
				t.Fatalf("VNets = %v, %v", vnets, err)
			}
			attachments, err := catalog.ResolveRouterAttachments(target, tc.key, 24)
			if err != nil {
				t.Fatal(err)
			}
			if len(attachments) != len(tc.routerDevices) {
				t.Fatalf("attachments = %+v", attachments)
			}
			for index, attachment := range attachments {
				if attachment.Device != tc.routerDevices[index] {
					t.Fatalf("device = %s", attachment.Device)
				}
				if index == 0 {
					if attachment.Bridge != "vmbr0" || attachment.VMVLANTag != nil {
						t.Fatalf("WAN attachment = %+v", attachment)
					}
				} else if attachment.Bridge != tc.vnets[index-1] || attachment.VMVLANTag == nil || *attachment.VMVLANTag != 24 {
					t.Fatalf("internal attachment = %+v", attachment)
				}
			}
		})
	}
}

func TestCatalogAssignmentRequirements(t *testing.T) {
	catalog, err := NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		profile     string
		routerCount int
		segments    map[string]string
		wantErr     bool
	}{
		{ProfileLANRouterV1, 1, map[string]string{"vm": ""}, false},
		{ProfileLANRouterV1, 1, map[string]string{"vm": SegmentDMZ}, true},
		{ProfileLANDMZRouterV1, 1, nil, true},
		{ProfileLANDMZRouterV1, 1, map[string]string{"vm": ""}, true},
		{ProfileLANDMZRouterV1, 1, map[string]string{"vm": SegmentDMZ}, false},
		{ProfileLANDMZRouterV1, 1, map[string]string{"vm": "invalid"}, true},
		{ProfileLANRouterV1, 0, nil, true},
		{ProfileLANRouterV1, 2, nil, true},
	} {
		if err := catalog.ValidateAssignments(tc.profile, tc.routerCount, tc.segments); (err != nil) != tc.wantErr {
			t.Errorf("ValidateAssignments(%s, %d, %v) = %v", tc.profile, tc.routerCount, tc.segments, err)
		}
	}
}

func TestCatalogProfilesCannotBeMutatedByCaller(t *testing.T) {
	catalog, err := NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	profile, err := catalog.Profile(ProfileLANRouterV1)
	if err != nil {
		t.Fatal(err)
	}
	profile.Segments[0].Key = "changed"
	profile.RouterInterfaces[0].Device = "changed"
	profile.PrefixNAT.SegmentKey = "changed"
	original, err := catalog.Profile(ProfileLANRouterV1)
	if err != nil {
		t.Fatal(err)
	}
	if original.Segments[0].Key != SegmentLAN || original.RouterInterfaces[0].Device != "net0" || original.PrefixNAT.SegmentKey != SegmentLAN {
		t.Fatalf("catalog mutated: %+v", original)
	}
}
