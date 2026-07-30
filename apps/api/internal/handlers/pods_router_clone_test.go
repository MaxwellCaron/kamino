package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func testPodRouterCloneCatalog(t *testing.T) *podnetwork.Catalog {
	t.Helper()

	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		LANVNet:   "pod",
		DMZVNet:   "dmz",
		WANIPBase: "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	return catalog
}

func newRouterCloneOptionsHandler(t *testing.T, vnets []map[string]any) *PodsHandler {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api2/json/cluster/sdn/vnets" {
			writeProxmoxAPIResponse(t, w, http.StatusOK, vnets)
			return
		}
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}))
	t.Cleanup(server.Close)

	return &PodsHandler{
		PX:             proxmox.NewHTTPTestClient(server),
		NetworkCatalog: testPodRouterCloneCatalog(t),
		RouterCloneConfig: PodRouterCloneConfig{
			LANVNet: "pod",
			DMZVNet: "dmz",
		},
	}
}

func validVNet(id string, tag int) map[string]any {
	return map[string]any{"vnet": id, "vlanaware": 1, "isolate-ports": 0, "tag": tag}
}

func TestSuggestPodRouterCloneNetworkOptions(t *testing.T) {
	t.Run("both profiles suggested when pod and dmz VNets are valid and distinct", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			validVNet("pod", 1000),
			validVNet("dmz", 2000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		var lanCount, dmzCount int
		var lanOption, dmzOption *podRouterCloneNetworkOption
		for i := range options {
			option := options[i]
			if option.NetworkNumber == 24 {
				switch option.NetworkProfileKey {
				case podnetwork.ProfileLANRouterV1:
					copy := option
					lanOption = &copy
				case podnetwork.ProfileLANDMZRouterV1:
					copy := option
					dmzOption = &copy
				}
			}
			switch option.NetworkProfileKey {
			case podnetwork.ProfileLANRouterV1:
				lanCount++
			case podnetwork.ProfileLANDMZRouterV1:
				dmzCount++
			}
		}

		if lanCount != 254 {
			t.Fatalf("LAN option count = %d, want 254", lanCount)
		}
		if dmzCount != 254 {
			t.Fatalf("LAN+DMZ option count = %d, want 254", dmzCount)
		}
		if lanOption == nil || len(lanOption.VNets) != 1 || lanOption.VNets[0] != "pod" {
			t.Fatalf("LAN option = %#v, want VNets [pod]", lanOption)
		}
		if dmzOption == nil || len(dmzOption.VNets) != 2 || dmzOption.VNets[0] != "pod" || dmzOption.VNets[1] != "dmz" {
			t.Fatalf("LAN + DMZ option = %#v, want VNets [pod dmz]", dmzOption)
		}
	})

	t.Run("LAN still suggested when DMZ VNet is absent", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			validVNet("pod", 1000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}

		var hasLAN, hasDMZ bool
		for _, option := range options {
			switch option.NetworkProfileKey {
			case podnetwork.ProfileLANRouterV1:
				hasLAN = true
			case podnetwork.ProfileLANDMZRouterV1:
				hasDMZ = true
			}
		}
		if !hasLAN {
			t.Fatal("expected LAN profile options when only the LAN VNet exists")
		}
		if hasDMZ {
			t.Fatal("did not expect LAN + DMZ profile options without a DMZ VNet")
		}
	})

	t.Run("non-VLAN-aware LAN VNet omits both profiles", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			{"vnet": "pod", "vlanaware": 0, "isolate-ports": 0, "tag": 1000},
			validVNet("dmz", 2000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}
		if len(options) != 0 {
			t.Fatalf("options = %#v, want none when the LAN VNet is not VLAN-aware", options)
		}
	})

	t.Run("port-isolated LAN VNet omits both profiles", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			{"vnet": "pod", "vlanaware": 1, "isolate-ports": 1, "tag": 1000},
			validVNet("dmz", 2000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}
		if len(options) != 0 {
			t.Fatalf("options = %#v, want none when the LAN VNet is port-isolated", options)
		}
	})

	t.Run("duplicate outer tag across pod and dmz omits both profiles", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			validVNet("pod", 1000),
			validVNet("dmz", 1000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}
		if len(options) != 0 {
			t.Fatalf("options = %#v, want none when pod/dmz share an outer VLAN tag", options)
		}
	})

	t.Run("no option outside 1..254", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			validVNet("pod", 1000),
			validVNet("dmz", 2000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}
		for _, option := range options {
			if option.NetworkNumber < 1 || option.NetworkNumber > 254 {
				t.Fatalf("option number %d is outside 1..254", option.NetworkNumber)
			}
		}
	})

	t.Run("stable profile and number ordering", func(t *testing.T) {
		handler := newRouterCloneOptionsHandler(t, []map[string]any{
			validVNet("pod", 1000),
			validVNet("dmz", 2000),
		})

		options, err := handler.suggestPodRouterCloneNetworkOptions(context.Background())
		if err != nil {
			t.Fatalf("suggestPodRouterCloneNetworkOptions() error = %v", err)
		}
		if len(options) != 508 {
			t.Fatalf("options len = %d, want 508 (254 LAN + 254 LAN+DMZ)", len(options))
		}
		if options[0].NetworkProfileKey != podnetwork.ProfileLANRouterV1 || options[0].NetworkNumber != 1 {
			t.Fatalf("options[0] = %+v, want LAN profile network 1", options[0])
		}
		if options[253].NetworkProfileKey != podnetwork.ProfileLANRouterV1 || options[253].NetworkNumber != 254 {
			t.Fatalf("options[253] = %+v, want LAN profile network 254", options[253])
		}
		if options[254].NetworkProfileKey != podnetwork.ProfileLANDMZRouterV1 || options[254].NetworkNumber != 1 {
			t.Fatalf("options[254] = %+v, want LAN+DMZ profile network 1", options[254])
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

	lanVNets, err := catalog.RequiredVNets(podnetwork.ProfileLANRouterV1)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN) error = %v", err)
	}
	if len(lanVNets) != 1 || lanVNets[0] != "pod" {
		t.Fatalf("LAN VNets = %#v, want [pod]", lanVNets)
	}

	dmzVNets, err := catalog.RequiredVNets(podnetwork.ProfileLANDMZRouterV1)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN+DMZ) error = %v", err)
	}
	if len(dmzVNets) != 2 || dmzVNets[0] != "pod" || dmzVNets[1] != "dmz" {
		t.Fatalf("LAN + DMZ VNets = %#v, want [pod dmz]", dmzVNets)
	}
}
