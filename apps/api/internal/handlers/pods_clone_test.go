package handlers

import (
	"strings"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
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
