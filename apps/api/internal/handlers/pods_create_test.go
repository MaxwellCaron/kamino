package handlers

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
)

func TestResolveCreateNetworkProfile(t *testing.T) {
	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		VNetPrefix:    "pod",
		DMZVNetPrefix: "dmz",
		DMZVLANBase:   1000,
		WANIPBase:     "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	handler := PodsHandler{NetworkCatalog: catalog}

	tests := []struct {
		name        string
		profileKey  string
		wantKey     string
		wantManaged bool
		wantErr     bool
	}{
		{name: "none", wantKey: "", wantManaged: false},
		{name: "LAN router", profileKey: podnetwork.ProfileLANRouterV1, wantKey: podnetwork.ProfileLANRouterV1, wantManaged: true},
		{name: "LAN and DMZ router", profileKey: podnetwork.ProfileLANDMZRouterV1, wantKey: podnetwork.ProfileLANDMZRouterV1, wantManaged: true},
		{name: "unknown", profileKey: "unknown-profile", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKey, gotManaged, err := handler.resolveCreateNetworkProfile(createPodRequest{
				NetworkProfileKey: tt.profileKey,
			})
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveCreateNetworkProfile() error = %v", err)
			}
			if gotKey != tt.wantKey || gotManaged != tt.wantManaged {
				t.Fatalf("resolveCreateNetworkProfile() = (%q, %v), want (%q, %v)", gotKey, gotManaged, tt.wantKey, tt.wantManaged)
			}
		})
	}
}
