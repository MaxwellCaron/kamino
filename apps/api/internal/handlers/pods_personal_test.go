package handlers

import (
	"net/netip"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/google/uuid"
)

func TestPersonalPodsEnabledUsesFeatureFlag(t *testing.T) {
	handler := &PodsHandler{PersonalPodRouterTemplateItemID: uuid.New()}
	if handler.PersonalPodsEnabled() {
		t.Fatal("personal pods should remain disabled when only a router template is configured")
	}

	handler.PersonalPodsFeatureEnabled = true
	handler.PersonalPodRouterTemplateItemID = uuid.Nil
	if !handler.PersonalPodsEnabled() {
		t.Fatal("personal pods should be enabled by the feature flag")
	}
}

func TestPersonalPodFolderName(t *testing.T) {
	longName := strings.Repeat("a", 80)
	tests := []struct {
		name     string
		username string
		want     string
	}{
		{name: "plain name", username: "Alice", want: "Alice"},
		{name: "dots spaces and underscores", username: "Alice.Smith_dev user", want: "Alice-Smith-dev-user"},
		{name: "starts with digit", username: "9alice", want: "user-9alice"},
		{name: "empty", username: "", want: "user-"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := personalPodFolderName(tt.username)
			if got != tt.want {
				t.Fatalf("personalPodFolderName() = %q, want %q", got, tt.want)
			}
			if err := names.ValidateFolder(got); err != nil {
				t.Fatalf("ValidateFolder(%q) = %v", got, err)
			}
		})
	}

	t.Run("truncates long names", func(t *testing.T) {
		got := personalPodFolderName(longName)
		if len(got) > 63 {
			t.Fatalf("len(%q) = %d, want <= 63", got, len(got))
		}
		if strings.HasSuffix(got, "-") {
			t.Fatalf("truncated name %q should not end with hyphen", got)
		}
		if err := names.ValidateFolder(got); err != nil {
			t.Fatalf("ValidateFolder(%q) = %v", got, err)
		}
	})
}

func TestPersonalPodFolderDescription(t *testing.T) {
	const representativeVNet = "pod4001"
	want := "To add another VM, choose Create VM from this folder and attach its network interface to VNet pod4001. You can confirm the VNet from the router VM dashboard."

	got := personalPodFolderDescription(representativeVNet)
	if got != want {
		t.Fatalf("personalPodFolderDescription() = %q, want %q", got, want)
	}

	trimmed := personalPodFolderDescription("  pod4001  ")
	if trimmed != want {
		t.Fatalf("personalPodFolderDescription() with whitespace = %q, want %q", trimmed, want)
	}

	longestVNet := personalPodScopedVNet("pod", 4094, 254)
	if len(personalPodFolderDescription(longestVNet)) > inventory.MaxFolderDescriptionLength {
		t.Fatalf(
			"personalPodFolderDescription(%q) length = %d, want <= %d",
			longestVNet,
			len(personalPodFolderDescription(longestVNet)),
			inventory.MaxFolderDescriptionLength,
		)
	}
}

func TestPersonalPodVNetName(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			PersonalVNetPrefix: "pod",
			PersonalVLANBase:   4000,
		},
	}
	if got := handler.personalPodVNetName(1); got != "pod4001" {
		t.Fatalf("personalPodVNetName() = %q, want %q", got, "pod4001")
	}

	handler.RouterCloneConfig.PersonalVNetPrefix = "  lab- "
	if got := handler.personalPodVNetName(1); got != "lab-4001" {
		t.Fatalf("personalPodVNetName() = %q, want %q", got, "lab-4001")
	}
}

func TestPersonalPodNetworkMetadata(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			PersonalVNetPrefix: "pod",
			PersonalVLANBase:   4000,
			PersonalWANIPBase:  "172.25.",
			InternalSubnet:     netip.MustParsePrefix("192.168.1.0/24"),
		},
	}

	got, err := handler.personalPodNetworkMetadata(1)
	if err != nil {
		t.Fatalf("personalPodNetworkMetadata() error = %v", err)
	}
	if got.Number != 1 || got.VNet != "pod4001" {
		t.Fatalf("network metadata = %#v", got)
	}
	if got.ExternalSubnet != "172.25.1.0/24" || got.ExternalGateway != "172.25.1.1" {
		t.Fatalf("external metadata = %#v", got)
	}
	if got.InternalSubnet != "192.168.1.0/24" || got.InternalGateway != "192.168.1.1" {
		t.Fatalf("internal metadata = %#v", got)
	}
}
