package handlers

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func testPodRouterCloneCatalog(t *testing.T) *podnetwork.Catalog {
	t.Helper()

	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		VNetPrefix:    "pod",
		LANVLANBase:   0,
		DMZVNetPrefix: "dmz",
		DMZVLANBase:   1000,
		WANIPBase:     "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	return catalog
}

func TestSuggestPodRouterCloneNetworkOptions(t *testing.T) {
	catalog := testPodRouterCloneCatalog(t)

	t.Run("both profiles suggested with pod24 and dmz1024", func(t *testing.T) {
		vnets := []proxmox.VNet{
			{VNet: "pod24", Tag: 24},
			{VNet: "dmz1024", Tag: 1024},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		var lanOption, dmzOption *podRouterCloneNetworkOption
		for i := range options {
			option := options[i]
			if option.NetworkNumber != 24 {
				continue
			}
			switch option.NetworkProfileKey {
			case podnetwork.ProfileLANRouterV1:
				copy := option
				lanOption = &copy
			case podnetwork.ProfileLANDMZRouterV1:
				copy := option
				dmzOption = &copy
			}
		}

		if lanOption == nil {
			t.Fatal("expected LAN profile option for network 24")
		}
		if len(lanOption.VNets) != 1 || lanOption.VNets[0] != "pod24" {
			t.Fatalf("LAN option VNets = %#v, want [pod24]", lanOption.VNets)
		}

		if dmzOption == nil {
			t.Fatal("expected LAN + DMZ profile option for network 24")
		}
		if len(dmzOption.VNets) != 2 || dmzOption.VNets[0] != "pod24" || dmzOption.VNets[1] != "dmz1024" {
			t.Fatalf("LAN + DMZ option VNets = %#v, want [pod24 dmz1024]", dmzOption.VNets)
		}
	})

	t.Run("LAN still suggested when DMZ is absent", func(t *testing.T) {
		vnets := []proxmox.VNet{{VNet: "pod24", Tag: 24}}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		var hasLAN, hasDMZ bool
		for _, option := range options {
			if option.NetworkNumber != 24 {
				continue
			}
			switch option.NetworkProfileKey {
			case podnetwork.ProfileLANRouterV1:
				hasLAN = true
			case podnetwork.ProfileLANDMZRouterV1:
				hasDMZ = true
			}
		}
		if !hasLAN {
			t.Fatal("expected LAN profile option when only LAN VNet exists")
		}
		if hasDMZ {
			t.Fatal("did not expect LAN + DMZ profile option without DMZ VNet")
		}
	})

	t.Run("a correctly named and tagged VNet is suggested regardless of allocation state", func(t *testing.T) {
		// A network already owned by an existing pod/dev/personal allocation must still be offered.
		vnets := []proxmox.VNet{
			{VNet: "pod24", Tag: 24},
			{VNet: "dmz1024", Tag: 1024},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		var found bool
		for _, option := range options {
			if option.NetworkNumber == 24 && option.NetworkProfileKey == podnetwork.ProfileLANRouterV1 {
				found = true
			}
		}
		if !found {
			t.Fatal("expected network 24 to be suggested for the LAN profile")
		}
	})

	t.Run("wrong LAN tag omits affected option", func(t *testing.T) {
		vnets := []proxmox.VNet{
			{VNet: "pod24", Tag: 25},
			{VNet: "dmz1024", Tag: 1024},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		for _, option := range options {
			if option.NetworkNumber == 24 && option.NetworkProfileKey == podnetwork.ProfileLANRouterV1 {
				t.Fatal("expected LAN option to be omitted when LAN tag is wrong")
			}
		}
	})

	t.Run("wrong DMZ tag omits LAN + DMZ option", func(t *testing.T) {
		vnets := []proxmox.VNet{
			{VNet: "pod24", Tag: 24},
			{VNet: "dmz1024", Tag: 1023},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		for _, option := range options {
			if option.NetworkNumber == 24 && option.NetworkProfileKey == podnetwork.ProfileLANDMZRouterV1 {
				t.Fatal("expected LAN + DMZ option to be omitted when DMZ tag is wrong")
			}
		}
	})

	t.Run("stable profile and number ordering", func(t *testing.T) {
		vnets := []proxmox.VNet{
			{VNet: "pod1", Tag: 1},
			{VNet: "pod2", Tag: 2},
			{VNet: "dmz1001", Tag: 1001},
			{VNet: "dmz1002", Tag: 1002},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		want := []struct {
			profile string
			number  int32
		}{
			{podnetwork.ProfileLANRouterV1, 1},
			{podnetwork.ProfileLANRouterV1, 2},
			{podnetwork.ProfileLANDMZRouterV1, 1},
			{podnetwork.ProfileLANDMZRouterV1, 2},
		}

		if len(options) < len(want) {
			t.Fatalf("options len = %d, want at least %d", len(options), len(want))
		}

		for i, expected := range want {
			if options[i].NetworkProfileKey != expected.profile || options[i].NetworkNumber != expected.number {
				t.Fatalf("options[%d] = (%q, %d), want (%q, %d)", i, options[i].NetworkProfileKey, options[i].NetworkNumber, expected.profile, expected.number)
			}
		}
	})

	t.Run("no option outside 1..254", func(t *testing.T) {
		vnets := []proxmox.VNet{
			{VNet: "pod0", Tag: 0},
			{VNet: "pod255", Tag: 255},
			{VNet: "dmz1000", Tag: 1000},
			{VNet: "dmz1255", Tag: 1255},
		}

		options, err := suggestPodRouterCloneNetworkOptions(catalog, vnets)
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		for _, option := range options {
			if option.NetworkNumber < 1 || option.NetworkNumber > 254 {
				t.Fatalf("option number %d is outside 1..254", option.NetworkNumber)
			}
		}
	})
}

func TestParsePodRouterCloneRequest(t *testing.T) {
	catalog := testPodRouterCloneCatalog(t)

	t.Run("unknown profile", func(t *testing.T) {
		_, _, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     24,
			NetworkProfileKey: "unknown-profile",
		})
		if reqErr == nil {
			t.Fatal("expected error for unknown profile")
		}
	})

	t.Run("network number 0", func(t *testing.T) {
		_, _, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     0,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
		})
		if reqErr == nil {
			t.Fatal("expected error for network number 0")
		}
	})

	t.Run("network number 255", func(t *testing.T) {
		_, _, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     255,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
		})
		if reqErr == nil {
			t.Fatal("expected error for network number 255")
		}
	})

	t.Run("zero VMID is automatic", func(t *testing.T) {
		_, _, _, vmid, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     24,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
			VMID:              0,
		})
		if reqErr != nil {
			t.Fatalf("parsePodRouterCloneRequest() error = %v", reqErr)
		}
		if vmid != 0 {
			t.Fatalf("vmid = %d, want 0", vmid)
		}
	})

	t.Run("positive VMID outside the configured workflow range is accepted", func(t *testing.T) {
		_, _, _, vmid, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     24,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
			VMID:              54321,
		})
		if reqErr != nil {
			t.Fatalf("parsePodRouterCloneRequest() error = %v", reqErr)
		}
		if vmid != 54321 {
			t.Fatalf("vmid = %d, want 54321", vmid)
		}
	})

	t.Run("VMID below the minimum is rejected", func(t *testing.T) {
		for _, vmid := range []int{1, 99} {
			_, _, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
				TargetFolderID:    "00000000-0000-0000-0000-000000000001",
				NetworkNumber:     24,
				NetworkProfileKey: podnetwork.ProfileLANRouterV1,
				VMID:              vmid,
			})
			if reqErr == nil {
				t.Fatalf("expected error for vmid %d", vmid)
			}
			if reqErr.Status != http.StatusUnprocessableEntity {
				t.Fatalf("vmid %d: status = %d, want %d", vmid, reqErr.Status, http.StatusUnprocessableEntity)
			}
		}
	})
}

func TestBuildRouterCloudInitConfigForProfileRouterClone(t *testing.T) {
	lanConfig, err := buildRouterCloudInitConfigForProfile(24, podnetwork.ProfileLANRouterV1, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-network-config.yaml",
	})
	if err != nil {
		t.Fatalf("buildRouterCloudInitConfigForProfile(LAN) error = %v", err)
	}
	if lanConfig.UserFile != "kamino-router-24-user-data.yaml" {
		t.Fatalf("LAN user file = %q", lanConfig.UserFile)
	}
	if lanConfig.NetworkFile != "kamino-router-network-config.yaml" {
		t.Fatalf("LAN network file = %q", lanConfig.NetworkFile)
	}

	dmzConfig, err := buildRouterCloudInitConfigForProfile(24, podnetwork.ProfileLANDMZRouterV1, PodRouterCloneConfig{
		CloudInitStorage:               "local",
		LANDMZCloudInitUserFilePattern: "kamino-router-dmz-{network}-user-data.yaml",
		LANDMZCloudInitNetworkFile:     "kamino-router-dmz-network-config.yaml",
	})
	if err != nil {
		t.Fatalf("buildRouterCloudInitConfigForProfile(LAN+DMZ) error = %v", err)
	}
	if dmzConfig.UserFile != "kamino-router-dmz-24-user-data.yaml" {
		t.Fatalf("LAN + DMZ user file = %q", dmzConfig.UserFile)
	}
	if dmzConfig.NetworkFile != "kamino-router-dmz-network-config.yaml" {
		t.Fatalf("LAN + DMZ network file = %q", dmzConfig.NetworkFile)
	}
}

func TestPodRouterCloneResponseVNets(t *testing.T) {
	catalog := testPodRouterCloneCatalog(t)

	lanVNets, err := catalog.RequiredVNets(podnetwork.ProfileLANRouterV1, 24)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN) error = %v", err)
	}
	if len(lanVNets) != 1 || lanVNets[0] != "pod24" {
		t.Fatalf("LAN VNets = %#v, want [pod24]", lanVNets)
	}

	dmzVNets, err := catalog.RequiredVNets(podnetwork.ProfileLANDMZRouterV1, 24)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN+DMZ) error = %v", err)
	}
	if len(dmzVNets) != 2 || dmzVNets[0] != "pod24" || dmzVNets[1] != "dmz1024" {
		t.Fatalf("LAN + DMZ VNets = %#v, want [pod24 dmz1024]", dmzVNets)
	}
}
