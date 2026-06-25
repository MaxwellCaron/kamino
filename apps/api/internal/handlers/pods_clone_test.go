package handlers

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
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
	handler := &PodsHandler{
		RouterCloneConfig: PodRouterCloneConfig{
			VNetPrefix:     "pod",
			WANIPBase:      "172.16.",
			InternalIPBase: "10.128.",
		},
	}

	got := handler.clonedPodNetworkMetadata(24)
	if got.Number != 24 || got.VNet != "pod24" {
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

func TestBuildClonedRouterCloudInitConfig(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-{network}-user-data.yaml",
		CloudInitMetaFilePattern: "kamino-router-{network}-meta-data.yaml",
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
	if config.MetaFile != "kamino-router-24-meta-data.yaml" {
		t.Fatalf("MetaFile = %q, want %q", config.MetaFile, "kamino-router-24-meta-data.yaml")
	}
	if config.NetworkFile != "kamino-router-network-config.yaml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "kamino-router-network-config.yaml")
	}
}

func TestBuildClonedRouterCloudInitConfigSupportsCustomPatterns(t *testing.T) {
	config, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local-zfs",
		CloudInitUserFilePattern: "lab-router-{network}-userdata.yml",
		CloudInitMetaFilePattern: "lab-router-{network}-metadata.yml",
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
	if config.MetaFile != "lab-router-24-metadata.yml" {
		t.Fatalf("MetaFile = %q, want %q", config.MetaFile, "lab-router-24-metadata.yml")
	}
	if config.NetworkFile != "lab-router-network.yml" {
		t.Fatalf("NetworkFile = %q, want %q", config.NetworkFile, "lab-router-network.yml")
	}
}

func TestBuildClonedRouterCloudInitConfigRejectsInvalidPatterns(t *testing.T) {
	_, err := buildClonedRouterCloudInitConfig(24, PodRouterCloneConfig{
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "kamino-router-user-data.yaml",
		CloudInitMetaFilePattern: "kamino-router-{network}-meta-data.yaml",
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
		CloudInitMetaFilePattern: "kamino-router-{network}-meta-data.yaml",
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

func TestFindPodNetworkRouterTargetRequiresExactlyOneRouter(t *testing.T) {
	routerTarget := podNetworkVMTarget{
		name:   "router",
		router: true,
	}
	otherTarget := podNetworkVMTarget{
		name: "workstation",
	}

	found, reqErr := findPodNetworkRouterTarget([]podNetworkVMTarget{otherTarget, routerTarget})
	if reqErr != nil {
		t.Fatalf("findPodNetworkRouterTarget() error = %v", reqErr)
	}
	if found == nil || !found.router || found.name != "router" {
		t.Fatalf("findPodNetworkRouterTarget() = %#v", found)
	}

	if _, reqErr := findPodNetworkRouterTarget([]podNetworkVMTarget{otherTarget}); reqErr == nil {
		t.Fatalf("expected error when router is missing")
	}
	if _, reqErr := findPodNetworkRouterTarget([]podNetworkVMTarget{routerTarget, routerTarget}); reqErr == nil {
		t.Fatalf("expected error when multiple routers are present")
	}
}

func TestBuildPrincipalPodQuestionAnswerParamsUsesSubmittingPrincipal(t *testing.T) {
	submittingPrincipalID := uuid.New()
	clone := database.ClonedPods{
		ID:              uuid.New(),
		UserPrincipalID: uuid.New(),
	}
	question := database.GetQuestionForClonedPodRow{
		ID:        uuid.New(),
		TaskID:    uuid.New(),
		PodID:     uuid.New(),
		Title:     "Question",
		TaskTitle: "Task",
		PodSlug:   "pod-slug",
		PodTitle:  "Pod",
	}
	answer := database.UpsertClonedPodQuestionAnswerRow{
		QuestionID: question.ID,
		Answer:     "answer",
		IsCorrect:  true,
		AnsweredAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}

	params := buildPrincipalPodQuestionAnswerParams(submittingPrincipalID, clone, question, answer)

	if params.PrincipalID != submittingPrincipalID {
		t.Fatalf("PrincipalID = %v, want %v", params.PrincipalID, submittingPrincipalID)
	}
	if params.PrincipalID == clone.UserPrincipalID {
		t.Fatalf("PrincipalID = %v, want submitting principal instead of clone owner", params.PrincipalID)
	}
}

func TestBuildPrincipalPodQuestionAnswerParamsCopiesSourceMetadata(t *testing.T) {
	principalID := uuid.New()
	cloneID := uuid.New()
	podID := uuid.New()
	taskID := uuid.New()
	questionID := uuid.New()
	clone := database.ClonedPods{ID: cloneID}
	question := database.GetQuestionForClonedPodRow{
		ID:        questionID,
		TaskID:    taskID,
		PodID:     podID,
		Title:     "What is the flag?",
		TaskTitle: "Capture the flag",
		PodSlug:   "ctf-pod",
		PodTitle:  "CTF Pod",
	}
	answer := database.UpsertClonedPodQuestionAnswerRow{
		QuestionID: questionID,
		Answer:     "flag{kamino}",
		IsCorrect:  false,
		AnsweredAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}

	params := buildPrincipalPodQuestionAnswerParams(principalID, clone, question, answer)

	if params.SourcePodID != podID {
		t.Fatalf("SourcePodID = %v, want %v", params.SourcePodID, podID)
	}
	if params.SourceTaskID != taskID {
		t.Fatalf("SourceTaskID = %v, want %v", params.SourceTaskID, taskID)
	}
	if params.SourceQuestionID != questionID {
		t.Fatalf("SourceQuestionID = %v, want %v", params.SourceQuestionID, questionID)
	}
	if params.LastClonedPodID == nil || *params.LastClonedPodID != cloneID {
		t.Fatalf("LastClonedPodID = %v, want %v", params.LastClonedPodID, cloneID)
	}
	if params.PodSlug != question.PodSlug {
		t.Fatalf("PodSlug = %q, want %q", params.PodSlug, question.PodSlug)
	}
	if params.PodTitle != question.PodTitle {
		t.Fatalf("PodTitle = %q, want %q", params.PodTitle, question.PodTitle)
	}
	if params.TaskTitle != question.TaskTitle {
		t.Fatalf("TaskTitle = %q, want %q", params.TaskTitle, question.TaskTitle)
	}
	if params.QuestionTitle != question.Title {
		t.Fatalf("QuestionTitle = %q, want %q", params.QuestionTitle, question.Title)
	}
	if params.Answer != answer.Answer {
		t.Fatalf("Answer = %q, want %q", params.Answer, answer.Answer)
	}
	if params.IsCorrect != answer.IsCorrect {
		t.Fatalf("IsCorrect = %t, want %t", params.IsCorrect, answer.IsCorrect)
	}
}

func TestBuildPrincipalPodQuestionAnswerParamsCopiesLiveAnsweredAt(t *testing.T) {
	answeredAt := pgtype.Timestamptz{
		Time:  time.Date(2026, time.June, 21, 14, 5, 0, 0, time.UTC),
		Valid: true,
	}

	params := buildPrincipalPodQuestionAnswerParams(
		uuid.New(),
		database.ClonedPods{ID: uuid.New()},
		database.GetQuestionForClonedPodRow{
			ID:        uuid.New(),
			TaskID:    uuid.New(),
			PodID:     uuid.New(),
			Title:     "Question",
			TaskTitle: "Task",
			PodSlug:   "pod-slug",
			PodTitle:  "Pod",
		},
		database.UpsertClonedPodQuestionAnswerRow{
			QuestionID: uuid.New(),
			Answer:     "correct",
			IsCorrect:  true,
			AnsweredAt: answeredAt,
		},
	)

	if params.AnsweredAt != answeredAt {
		t.Fatalf("AnsweredAt = %#v, want %#v", params.AnsweredAt, answeredAt)
	}
}

func TestNormalizeRouterIPBase(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"empty returns empty", "", "", false},
		{"whitespace returns empty", "   ", "", false},
		{"single octet", "172", "172.", false},
		{"two octets", "172.16", "172.16.", false},
		{"three octets", "172.16.0", "172.16.0.", false},
		{"trailing dot stripped", "172.16.", "172.16.", false},
		{"double trailing dot", "172.16..", "", true},
		{"empty parts", "172..16", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeRouterIPBase(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateClonedRouterCloudInitFileName(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		wantErr  bool
		errMsg   string
	}{
		{"valid filename", "user-data.yaml", false, ""},
		{"empty filename", "", true, "required"},
		{"whitespace only", "   ", true, "required"},
		{"path separator forward slash", "dir/file.yaml", true, "path separators"},
		{"path separator backslash", "dir\\file.yaml", true, "path separators"},
		{"double dot", "dir..file.yaml", true, "'..'"},
		{"contains space", "user data.yaml", true, "whitespace"},
		{"contains tab", "user\tdata.yaml", true, "whitespace"},
		{"contains newline", "user\ndata.yaml", true, "whitespace"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateClonedRouterCloudInitFileName(tt.filename)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errMsg)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestClonedPodRuntimeStatus(t *testing.T) {
	tests := []struct {
		name     string
		statuses []string
		want     string
	}{
		{"empty returns partial", nil, "partial"},
		{"single running", []string{"running"}, "running"},
		{"single stopped", []string{"stopped"}, "stopped"},
		{"all running", []string{"running", "running"}, "running"},
		{"all stopped", []string{"stopped", "stopped"}, "stopped"},
		{"mixed returns partial", []string{"running", "stopped"}, "partial"},
		{"unknown status returns partial", []string{"running", "paused"}, "partial"},
		{"single unknown returns partial", []string{"paused"}, "partial"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clonedPodRuntimeStatus(tt.statuses); got != tt.want {
				t.Errorf("clonedPodRuntimeStatus(%v) = %q, want %q", tt.statuses, got, tt.want)
			}
		})
	}
}

func TestVmidsFromTargets(t *testing.T) {
	targets := []vmactions.Target{
		{VMID: 100},
		{VMID: 200},
		{VMID: 300},
	}
	got := vmidsFromTargets(targets)
	if len(got) != 3 || got[0] != 100 || got[1] != 200 || got[2] != 300 {
		t.Errorf("vmidsFromTargets() = %v, want [100 200 300]", got)
	}

	got = vmidsFromTargets(nil)
	if len(got) != 0 {
		t.Errorf("nil input: got %v, want empty", got)
	}
}

func TestClonedPodVMAlreadyInPowerState(t *testing.T) {
	tests := []struct {
		name   string
		action string
		status string
		want   bool
	}{
		{"start when running", "start", "running", true},
		{"start when stopped", "start", "stopped", false},
		{"start when empty", "start", "", false},
		{"shutdown when stopped", "shutdown", "stopped", true},
		{"shutdown when running", "shutdown", "running", false},
		{"shutdown when empty", "shutdown", "", false},
		{"shutdown when paused", "shutdown", "paused", true},
		{"unknown action", "restart", "running", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clonedPodVMAlreadyInPowerState(tt.action, tt.status); got != tt.want {
				t.Errorf("clonedPodVMAlreadyInPowerState(%q, %q) = %v, want %v", tt.action, tt.status, got, tt.want)
			}
		})
	}
}

func TestIsMissingProxmoxVMError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"does not exist", fmt.Errorf("VM does not exist"), true},
		{"not found", fmt.Errorf("404 Not Found"), true},
		{"no such vm", fmt.Errorf("no such vm 123"), true},
		{"case insensitive", fmt.Errorf("VM Does Not Exist on node"), true},
		{"unrelated error", fmt.Errorf("connection refused"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMissingProxmoxVMError(tt.err); got != tt.want {
				t.Errorf("isMissingProxmoxVMError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestAnswersMatch(t *testing.T) {
	tests := []struct {
		name     string
		answer   string
		expected string
		want     bool
	}{
		{"exact match", "hello", "hello", true},
		{"case insensitive", "Hello", "hello", true},
		{"trimmed whitespace", "  hello  ", "hello", true},
		{"both trimmed", "  hello  ", "  hello  ", true},
		{"different", "hello", "world", false},
		{"empty match", "", "", true},
		{"empty vs whitespace", "", "   ", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := answersMatch(tt.answer, tt.expected); got != tt.want {
				t.Errorf("answersMatch(%q, %q) = %v, want %v", tt.answer, tt.expected, got, tt.want)
			}
		})
	}
}

func TestCloneFolderName(t *testing.T) {
	t.Run("valid username", func(t *testing.T) {
		got, err := cloneFolderName("alice")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "alice" {
			t.Errorf("got %q, want %q", got, "alice")
		}
	})
	t.Run("numeric prefix gets User- prefix", func(t *testing.T) {
		got, err := cloneFolderName("123user")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(got, "User-") {
			t.Errorf("got %q, expected User- prefix", got)
		}
	})
	t.Run("long name is truncated", func(t *testing.T) {
		long := strings.Repeat("a", 100)
		got, err := cloneFolderName(long)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(got) > 63 {
			t.Errorf("len(%q) = %d, want <= 63", got, len(got))
		}
	})
	t.Run("sanitizes special characters", func(t *testing.T) {
		got, err := cloneFolderName("user@name!")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if err := names.ValidateFolder(got); err != nil {
			t.Errorf("ValidateFolder(%q) = %v; want nil", got, err)
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

func TestCloneOwnerFromPrincipal(t *testing.T) {
	id := uuid.New()

	t.Run("uses name over external ID", func(t *testing.T) {
		name := "Alice Smith"
		row := database.ListPrincipalDetailsByIDsRow{
			ID:            id,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    "alice@ad",
			Name:          &name,
		}
		got := cloneOwnerFromPrincipal(row)
		if got.Label != "Alice Smith" {
			t.Errorf("Label = %q, want %q", got.Label, "Alice Smith")
		}
		if got.Description != "alice@ad" {
			t.Errorf("Description = %q, want %q", got.Description, "alice@ad")
		}
	})
	t.Run("falls back to external ID for label", func(t *testing.T) {
		row := database.ListPrincipalDetailsByIDsRow{
			ID:            id,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    "alice@ad",
		}
		got := cloneOwnerFromPrincipal(row)
		if got.Label != "alice@ad" {
			t.Errorf("Label = %q, want %q", got.Label, "alice@ad")
		}
	})
	t.Run("uses description when present", func(t *testing.T) {
		desc := "Lab admin"
		row := database.ListPrincipalDetailsByIDsRow{
			ID:            id,
			PrincipalType: database.PrincipalTypeGroup,
			ExternalID:    "grp-001",
			Description:   &desc,
		}
		got := cloneOwnerFromPrincipal(row)
		if got.Description != "Lab admin" {
			t.Errorf("Description = %q, want %q", got.Description, "Lab admin")
		}
	})
}

func TestNewClonePodProgressReporter(t *testing.T) {
	t.Run("empty ID returns nil", func(t *testing.T) {
		if got := newClonePodProgressReporter(""); got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})
	t.Run("whitespace ID returns nil", func(t *testing.T) {
		if got := newClonePodProgressReporter("   "); got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})
	t.Run("valid ID returns reporter", func(t *testing.T) {
		if got := newClonePodProgressReporter("test-123"); got == nil {
			t.Error("expected non-nil reporter")
		}
	})
}

// Suppress unused import warnings
var _ = fmt.Sprintf
var _ = vmactions.PowerActionStart
