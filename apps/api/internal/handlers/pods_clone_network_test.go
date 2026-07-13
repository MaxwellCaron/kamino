package handlers

import (
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
)

func TestClonedPodVNetName(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			VNetPrefix: "pod",
		},
	}
	if got := handler.clonedPodVNetName(17); got != "pod17" {
		t.Fatalf("clonedPodVNetName() = %q, want %q", got, "pod17")
	}

	handler.RouterCloneConfig.VNetPrefix = "  lab- "
	if got := handler.clonedPodVNetName(17); got != "lab-17" {
		t.Fatalf("clonedPodVNetName() trimmed prefix = %q, want %q", got, "lab-17")
	}
}

func TestClonedPodNetworkMetadata(t *testing.T) {
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

	tests := []struct {
		name           string
		clone          database.ClonedPods
		wantVNet       string
		wantExtSubnet  string
		wantExtGateway string
	}{
		{"published clone", database.ClonedPods{NetworkNumber: 24, NetworkProfileKey: podnetwork.ProfileLANRouterV1}, "pod24", "172.16.24.0/24", "172.16.24.1"},
		{"development", database.ClonedPods{NetworkNumber: 245, NetworkProfileKey: podnetwork.ProfileLANRouterV1}, "pod245", "172.16.245.0/24", "172.16.245.1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := &PodsHandler{
				NetworkCatalog: catalog,
				RouterCloneConfig: PodRouterCloneConfig{
					VNetPrefix: "pod",
					WANIPBase:  "172.16.",
				},
			}

			got, err := handler.clonedPodNetworkMetadata(tt.clone)
			if err != nil {
				t.Fatalf("clonedPodNetworkMetadata() error = %v", err)
			}
			if got.Number != tt.clone.NetworkNumber || got.VNet != tt.wantVNet {
				t.Fatalf("metadata identity = %#v", got)
			}
			if got.ExternalSubnet != tt.wantExtSubnet || got.ExternalGateway != tt.wantExtGateway {
				t.Fatalf("external metadata = %#v", got)
			}
			if got.InternalSubnet != "192.168.1.0/24" {
				t.Fatalf("internal subnet = %q, want 192.168.1.0/24", got.InternalSubnet)
			}
			if got.InternalGateway != "192.168.1.1" {
				t.Fatalf("internal gateway = %q, want 192.168.1.1", got.InternalGateway)
			}
		})
	}
}

func TestBuildClonedRouterCloudInitConfig(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-network-config.yaml",
	})
	if err != nil {
		t.Fatalf("buildClonedRouterCloudInitConfig() error = %v", err)
	}
	if config.Storage != "local" {
		t.Fatalf("Storage = %q, want %q", config.Storage, "local")
	}
	if config.UserFile != "kamino-router-24-user-data.yaml" {
		t.Fatalf("UserFile = %q, want %q", config.UserFile, "kamino-router-24-user-data.yaml")
	}
	if config.NetworkFile != "kamino-router-network-config.yaml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "kamino-router-network-config.yaml")
	}
}

func TestBuildClonedRouterCloudInitConfigSupportsCustomPatterns(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local-zfs",
		CloudInitUserFilePattern: "lab-router-{network}-userdata.yml",
		CloudInitNetworkFile:     "lab-router-network.yml",
	})
	if err != nil {
		t.Fatalf("buildClonedRouterCloudInitConfig() error = %v", err)
	}
	if config.Storage != "local-zfs" {
		t.Fatalf("Storage = %q, want %q", config.Storage, "local-zfs")
	}
	if config.UserFile != "lab-router-24-userdata.yml" {
		t.Fatalf("UserFile = %q, want %q", config.UserFile, "lab-router-24-userdata.yml")
	}
	if config.NetworkFile != "lab-router-network.yml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "lab-router-network.yml")
	}
}

func TestBuildClonedRouterCloudInitConfigRejectsInvalidPatterns(t *testing.T) {
	_, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-network-config.yaml",
	})
	if err == nil {
		t.Fatalf("expected invalid user-data pattern error")
	}
	if !strings.Contains(err.Error(), "pattern must contain {network} exactly once") {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "kamino-router-{network}-network-config.yaml",
	})
	if err == nil {
		t.Fatalf("expected invalid network-config filename error")
	}
	if !strings.Contains(err.Error(), "must not contain {network}") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestIsPublishedPodRouterVM(t *testing.T) {
	if !isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{IsRouter: true, Name: "workstation"}) {
		t.Fatal("expected is_router=true to identify router")
	}
	if isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{Name: "router"}) {
		t.Fatal("expected workload named router without is_router to remain a workload")
	}
}

func TestPublishedPodVMTemplateItemID(t *testing.T) {
	publishedTemplateID := uuid.New()
	routerTemplateID := uuid.New()

	t.Run("router uses configured source template", func(t *testing.T) {
		got, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			IsRouter:              true,
			SourceInventoryItemID: publishedTemplateID,
		}, routerTemplateID)
		if err != nil {
			t.Fatalf("publishedPodVMTemplateItemID() error = %v", err)
		}
		if got != routerTemplateID {
			t.Fatalf("template ID = %s, want %s", got, routerTemplateID)
		}
	})

	t.Run("non-router uses published template", func(t *testing.T) {
		got, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{
			SourceInventoryItemID: publishedTemplateID,
		}, routerTemplateID)
		if err != nil {
			t.Fatalf("publishedPodVMTemplateItemID() error = %v", err)
		}
		if got != publishedTemplateID {
			t.Fatalf("template ID = %s, want %s", got, publishedTemplateID)
		}
	})

	t.Run("router requires configured template", func(t *testing.T) {
		if _, err := publishedPodVMTemplateItemID(database.ListPublishedPodVMsForCloneRow{IsRouter: true}, uuid.Nil); err == nil {
			t.Fatal("expected missing router template error")
		}
	})
}

func TestPodNetworkTargetsFromCloneResults(t *testing.T) {
	results := []clonePublishedVMResult{
		{
			published: database.ListPublishedPodVMsForCloneRow{Name: "router"},
			clone:     clonedVM{VMID: 100},
			router:    true,
		},
		{
			published: database.ListPublishedPodVMsForCloneRow{Name: "workstation"},
			clone:     clonedVM{VMID: 101},
			router:    false,
		},
	}
	targets := podNetworkTargetsFromCloneResults(results)
	if len(targets) != 2 {
		t.Fatalf("len = %d, want 2", len(targets))
	}
	if targets[0].name != "router" || !targets[0].router {
		t.Errorf("target[0] = %+v", targets[0])
	}
	if targets[1].name != "workstation" || targets[1].router {
		t.Errorf("target[1] = %+v", targets[1])
	}
}
