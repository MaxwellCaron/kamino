package handlers

import (
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/vyos"
	"github.com/google/uuid"
)

func TestManagerCloneFolderName(t *testing.T) {
	fixedID := uuid.MustParse("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
	suffix := fixedID.String()[:8] // "a1b2c3d4"

	tests := []struct {
		name          string
		principalID   uuid.UUID
		principalType string
		displayLabel  string
		want          string
		wantErr       bool
		checkPrefix   string
		checkSuffix   string
		maxLen        int
	}{
		{
			name:          "user principal with display name",
			principalID:   fixedID,
			principalType: "user",
			displayLabel:  "Alice Smith",
			checkPrefix:   "user-",
			checkSuffix:   suffix,
			maxLen:        63,
		},
		{
			name:          "group principal",
			principalID:   fixedID,
			principalType: "group",
			displayLabel:  "Platform Team",
			want:          "Group-Platform-Team",
			maxLen:        63,
		},
		{
			name:          "group principal with punctuation",
			principalID:   fixedID,
			principalType: "group",
			displayLabel:  "Team: Blue/Green",
			want:          "Group-Team-Blue-Green",
			maxLen:        63,
		},
		{
			name:          "long group display name returns error",
			principalID:   fixedID,
			principalType: "group",
			displayLabel:  "This-Is-A-Very-Long-Group-Display-Name-That-Exceeds-The-Maximum-Folder-Name-Length-Limit",
			wantErr:       true,
		},
		{
			name:          "long display name is truncated preserving suffix",
			principalID:   fixedID,
			principalType: "user",
			displayLabel:  "This-Is-A-Very-Long-Display-Name-That-Exceeds-The-Maximum-Folder-Name-Length-Limit",
			checkPrefix:   "user-",
			checkSuffix:   suffix,
			maxLen:        63,
		},
		{
			name:          "punctuation in display name is sanitized",
			principalID:   fixedID,
			principalType: "user",
			displayLabel:  "O'Brien & Associates!",
			checkPrefix:   "user-",
			checkSuffix:   suffix,
			maxLen:        63,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := managerCloneFolderName(tt.principalID, tt.principalType, tt.displayLabel)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.want != "" && got != tt.want {
				t.Errorf("got %q; want %q", got, tt.want)
			}
			if err := names.ValidateFolder(got); err != nil {
				t.Errorf("ValidateFolder(%q) = %v; want nil", got, err)
			}
			if len(got) > tt.maxLen {
				t.Errorf("len(%q) = %d; want <= %d", got, len(got), tt.maxLen)
			}
			if tt.checkPrefix != "" && !strings.HasPrefix(got, tt.checkPrefix) {
				t.Errorf("folder %q does not start with %q", got, tt.checkPrefix)
			}
			if tt.checkSuffix != "" && !strings.HasSuffix(got, tt.checkSuffix) {
				t.Errorf("folder %q does not end with %q", got, tt.checkSuffix)
			}
			if tt.principalType == "group" && strings.HasSuffix(got, suffix) {
				t.Errorf("group folder %q should not end with UUID suffix %q", got, suffix)
			}
		})
	}
}

func TestClonedPodVNetName(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			VNetPrefix: "kamino",
		},
	}
	if got := handler.clonedPodVNetName(17); got != "kamino17" {
		t.Fatalf("clonedPodVNetName() = %q, want %q", got, "kamino17")
	}

	handler.RouterCloneConfig.VNetPrefix = "  lab- "
	if got := handler.clonedPodVNetName(17); got != "lab-17" {
		t.Fatalf("clonedPodVNetName() trimmed prefix = %q, want %q", got, "lab-17")
	}
}

func TestClonedPodNetworkMetadata(t *testing.T) {
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			VNetPrefix:     "kamino",
			WANIPBase:      "172.16.",
			InternalIPBase: "10.128.",
		},
	}

	got := handler.clonedPodNetworkMetadata(24)
	if got.Number != 24 || got.VNet != "kamino24" {
		t.Fatalf("metadata identity = %#v", got)
	}
	if got.ExternalSubnet != "172.16.24.0/24" || got.ExternalGateway != "172.16.24.1" {
		t.Fatalf("external metadata = %#v", got)
	}
	if got.InternalSubnet == nil || *got.InternalSubnet != "10.128.24.0/24" {
		t.Fatalf("internal subnet = %#v", got.InternalSubnet)
	}
	if got.InternalGateway == nil || *got.InternalGateway != "10.128.24.1" {
		t.Fatalf("internal gateway = %#v", got.InternalGateway)
	}
}

func TestBuildClonedRouterRESTConfig(t *testing.T) {
	config, err := buildClonedRouterRESTConfig(24, PodRouterCloneConfig{
		WANIPBase:      "172.16",
		InternalIPBase: "10.128.",
	})
	if err != nil {
		t.Fatalf("buildClonedRouterRESTConfig() error = %v", err)
	}
	if config.APIAddress != "172.16.24.1" {
		t.Fatalf("APIAddress = %q, want %q", config.APIAddress, "172.16.24.1")
	}
	if config.ExternalAddress != "172.16.24.1/24" {
		t.Fatalf("ExternalAddress = %q, want %q", config.ExternalAddress, "172.16.24.1/24")
	}
	if config.InternalAddress != "10.128.24.1/24" {
		t.Fatalf("InternalAddress = %q, want %q", config.InternalAddress, "10.128.24.1/24")
	}
	if config.ExternalSubnet != "172.16.24.0/24" {
		t.Fatalf("ExternalSubnet = %q, want %q", config.ExternalSubnet, "172.16.24.0/24")
	}
	if config.InternalSubnet != "10.128.24.0/24" {
		t.Fatalf("InternalSubnet = %q, want %q", config.InternalSubnet, "10.128.24.0/24")
	}

	requiredOps := []vyos.ConfigureOperation{
		{Op: "delete", Path: []string{"interfaces", "ethernet", "eth0", "address"}},
		{Op: "delete", Path: []string{"interfaces", "ethernet", "eth1", "address"}},
		{Op: "set", Path: []string{"interfaces", "ethernet", "eth0", "address", "172.16.24.1/24"}},
		{Op: "set", Path: []string{"interfaces", "ethernet", "eth1", "address", "10.128.24.1/24"}},
		{Op: "set", Path: []string{"nat", "destination", "rule", "2000", "destination", "address", "172.16.24.0/24"}},
		{Op: "set", Path: []string{"nat", "destination", "rule", "2000", "translation", "address", "10.128.24.0/24"}},
		{Op: "set", Path: []string{"nat", "source", "rule", "2000", "source", "address", "10.128.24.0/24"}},
		{Op: "set", Path: []string{"nat", "source", "rule", "2000", "translation", "address", "172.16.24.0/24"}},
	}
	for _, operation := range requiredOps {
		if !hasRouterOperation(config.Operations, operation) {
			t.Fatalf("missing operation %#v in %#v", operation, config.Operations)
		}
	}
}

func hasRouterOperation(operations []vyos.ConfigureOperation, want vyos.ConfigureOperation) bool {
	for _, operation := range operations {
		if operation.Op != want.Op || len(operation.Path) != len(want.Path) {
			continue
		}

		match := true
		for index := range want.Path {
			if operation.Path[index] != want.Path[index] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}

	return false
}

func TestIsPublishedPodRouterVM(t *testing.T) {
	trueCases := []string{"router", " Router ", "ROUTER"}
	for _, name := range trueCases {
		if !isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{Name: name}) {
			t.Fatalf("expected %q to be recognized as router", name)
		}
	}

	falseCases := []string{"vyos", "pfsense", "router-1", "pod-router"}
	for _, name := range falseCases {
		if isPublishedPodRouterVM(database.ListPublishedPodVMsForCloneRow{Name: name}) {
			t.Fatalf("expected %q not to be recognized as router", name)
		}
	}
}

func TestFindClonedRouterRequiresExactlyOneRouter(t *testing.T) {
	routerResult := clonePublishedVMResult{
		published: database.ListPublishedPodVMsForCloneRow{Name: "router"},
		router:    true,
	}
	otherResult := clonePublishedVMResult{
		published: database.ListPublishedPodVMsForCloneRow{Name: "workstation"},
	}

	found, reqErr := findClonedRouter([]clonePublishedVMResult{otherResult, routerResult})
	if reqErr != nil {
		t.Fatalf("findClonedRouter() error = %v", reqErr)
	}
	if found == nil || !found.router || found.published.Name != "router" {
		t.Fatalf("findClonedRouter() = %#v", found)
	}

	if _, reqErr := findClonedRouter([]clonePublishedVMResult{otherResult}); reqErr == nil {
		t.Fatalf("expected error when router is missing")
	}
	if _, reqErr := findClonedRouter([]clonePublishedVMResult{routerResult, routerResult}); reqErr == nil {
		t.Fatalf("expected error when multiple routers are present")
	}
}
