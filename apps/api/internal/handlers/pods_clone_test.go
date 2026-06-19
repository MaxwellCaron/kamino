package handlers

import (
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
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

	handler.RouterCloneConfig.InternalIPBase = ""
	got = handler.clonedPodNetworkMetadata(24)
	if got.InternalSubnet != nil || got.InternalGateway != nil {
		t.Fatalf("internal metadata should be omitted, got %#v", got)
	}
}

func TestRouterConfigCommandsVYOS(t *testing.T) {
	commands, err := routerConfigCommands(24, PodRouterCloneConfig{
		WANIPBase:      "172.16",
		VYOSScriptPath: "/config/scripts/vyos-postconfig-bootup.script",
	})
	if err != nil {
		t.Fatalf("routerConfigCommands() error = %v", err)
	}
	if len(commands) != 1 {
		t.Fatalf("len(commands) = %d, want 1", len(commands))
	}

	command := commands[0]
	if len(command) != 5 {
		t.Fatalf("len(command) = %d, want 5", len(command))
	}
	if command[0] != "sed" || command[1] != "-i" || command[2] != "-e" {
		t.Fatalf("command prefix = %#v", command[:3])
	}
	if !strings.Contains(command[3], "s/{{THIRD_OCTET}}/24/g") {
		t.Fatalf("replacement missing network number: %q", command[3])
	}
	if !strings.Contains(command[3], "s/{{NETWORK_PREFIX}}/172.16./g") {
		t.Fatalf("replacement missing normalized base: %q", command[3])
	}
	if command[4] != "/config/scripts/vyos-postconfig-bootup.script" {
		t.Fatalf("script path = %q", command[4])
	}
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
