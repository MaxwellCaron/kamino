package handlers

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
)

func TestParsePodRouterCloneRequest(t *testing.T) {
	catalog := testNetworkCatalog(t)

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

	t.Run("inner VLAN tag 255", func(t *testing.T) {
		_, tag, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     255,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
		})
		if reqErr != nil {
			t.Fatalf("parsePodRouterCloneRequest() error = %v", reqErr)
		}
		if tag != 255 {
			t.Fatalf("tag = %d, want 255", tag)
		}
	})

	t.Run("inner VLAN tag 256", func(t *testing.T) {
		_, _, _, _, reqErr := parsePodRouterCloneRequest(catalog, podRouterCloneRequest{
			TargetFolderID:    "00000000-0000-0000-0000-000000000001",
			NetworkNumber:     256,
			NetworkProfileKey: podnetwork.ProfileLANRouterV1,
		})
		if reqErr == nil {
			t.Fatal("expected error for inner VLAN tag 256")
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
	target := podCloneTarget{Key: "lab2", CloudInitStorage: "local"}

	lanConfig, err := buildRouterCloudInitConfigForProfile(24, podnetwork.ProfileLANRouterV1, target)
	if err != nil {
		t.Fatalf("buildRouterCloudInitConfigForProfile(LAN) error = %v", err)
	}
	if lanConfig.UserFile != "kamino-lab2-router-24-user-data.yaml" {
		t.Fatalf("LAN user file = %q", lanConfig.UserFile)
	}
	if lanConfig.NetworkFile != "kamino-lab2-router-network-config.yaml" {
		t.Fatalf("LAN network file = %q", lanConfig.NetworkFile)
	}

	dmzConfig, err := buildRouterCloudInitConfigForProfile(24, podnetwork.ProfileLANDMZRouterV1, target)
	if err != nil {
		t.Fatalf("buildRouterCloudInitConfigForProfile(LAN+DMZ) error = %v", err)
	}
	if dmzConfig.UserFile != "kamino-lab2-router-lan-dmz-24-user-data.yaml" {
		t.Fatalf("LAN + DMZ user file = %q", dmzConfig.UserFile)
	}
	if dmzConfig.NetworkFile != "kamino-lab2-router-lan-dmz-network-config.yaml" {
		t.Fatalf("LAN + DMZ network file = %q", dmzConfig.NetworkFile)
	}
}

func TestPodRouterCloneResponseVNets(t *testing.T) {
	catalog := testNetworkCatalog(t)

	lanVNets, err := catalog.RequiredVNets(testCloneTarget().Network(), podnetwork.ProfileLANRouterV1)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN) error = %v", err)
	}
	if len(lanVNets) != 1 || lanVNets[0] != "pod" {
		t.Fatalf("LAN VNets = %#v, want [pod]", lanVNets)
	}

	dmzVNets, err := catalog.RequiredVNets(testCloneTarget().Network(), podnetwork.ProfileLANDMZRouterV1)
	if err != nil {
		t.Fatalf("RequiredVNets(LAN+DMZ) error = %v", err)
	}
	if len(dmzVNets) != 2 || dmzVNets[0] != "pod" || dmzVNets[1] != "dmz" {
		t.Fatalf("LAN + DMZ VNets = %#v, want [pod dmz]", dmzVNets)
	}
}
