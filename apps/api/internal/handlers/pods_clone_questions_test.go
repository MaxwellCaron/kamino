package handlers

import (
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

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
