package handlers

import (
	"net/netip"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/names"
)

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

func TestPersonalPodVNetName(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			PersonalVNetPrefix: "pod",
		},
	}
	if got := handler.personalPodVNetName(200); got != "pod200" {
		t.Fatalf("personalPodVNetName() = %q, want %q", got, "pod200")
	}

	handler.RouterCloneConfig.PersonalVNetPrefix = "  lab- "
	if got := handler.personalPodVNetName(200); got != "lab-200" {
		t.Fatalf("personalPodVNetName() = %q, want %q", got, "lab-200")
	}
}

func TestPersonalPodNetworkMetadata(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			PersonalVNetPrefix: "pod",
			PersonalWANIPBase:  "172.16.",
			InternalSubnet:     netip.MustParsePrefix("192.168.1.0/24"),
		},
	}

	got, err := handler.personalPodNetworkMetadata(200)
	if err != nil {
		t.Fatalf("personalPodNetworkMetadata() error = %v", err)
	}
	if got.Number != 200 || got.VNet != "pod200" {
		t.Fatalf("network metadata = %#v", got)
	}
	if got.ExternalSubnet != "172.16.200.0/24" || got.ExternalGateway != "172.16.200.1" {
		t.Fatalf("external metadata = %#v", got)
	}
	if got.InternalSubnet != "192.168.1.0/24" || got.InternalGateway != "192.168.1.1" {
		t.Fatalf("internal metadata = %#v", got)
	}
}
