package pods

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

	params := buildPrincipalPodQuestionAnswerParams(submittingPrincipalID, clone, question, "answer", true)

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

	params := buildPrincipalPodQuestionAnswerParams(principalID, clone, question, "flag{kamino}", false)

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
	if params.Answer != "flag{kamino}" {
		t.Fatalf("Answer = %q, want %q", params.Answer, "flag{kamino}")
	}
	if params.IsCorrect {
		t.Fatalf("IsCorrect = true, want false")
	}
}

func TestBuildPodProgressResponse(t *testing.T) {
	doneTask, openTask, emptyTask := uuid.New(), uuid.New(), uuid.New()
	q1, q2, q3 := uuid.New(), uuid.New(), uuid.New()
	early := time.Date(2026, time.June, 1, 10, 0, 0, 0, time.UTC)
	late := time.Date(2026, time.June, 2, 10, 0, 0, 0, time.UTC)

	progress := buildPodProgressResponse(
		[]database.ListPublishedPodTasksByPodIDsRow{{ID: doneTask}, {ID: openTask}, {ID: emptyTask}},
		[]database.ListPublishedPodQuestionsByTaskIDsRow{
			{ID: q1, TaskID: doneTask},
			{ID: q2, TaskID: doneTask},
			{ID: q3, TaskID: openTask},
		},
		[]database.ListPrincipalPodQuestionAnswersRow{
			{QuestionID: q1, Answer: "a", IsCorrect: true, AnsweredAt: pgtype.Timestamptz{Time: early, Valid: true}},
			{QuestionID: q2, Answer: "b", IsCorrect: true, AnsweredAt: pgtype.Timestamptz{Time: late, Valid: true}},
			{QuestionID: q3, Answer: "wrong", IsCorrect: false, AnsweredAt: pgtype.Timestamptz{Time: late, Valid: true}},
		},
	)

	want := podQuestionSummaryResponse{Total: 3, Answered: 2, Progress: float64(2) / 3 * 100}
	if progress.QuestionSummary != want {
		t.Fatalf("QuestionSummary = %+v, want %+v", progress.QuestionSummary, want)
	}
	if len(progress.QuestionAnswers) != 3 {
		t.Fatalf("len(QuestionAnswers) = %d, want 3", len(progress.QuestionAnswers))
	}
	if len(progress.TaskStates) != 3 {
		t.Fatalf("len(TaskStates) = %d, want 3", len(progress.TaskStates))
	}

	done := progress.TaskStates[0]
	if !done.Completed || done.CompletedAt == nil || !done.CompletedAt.Equal(late) {
		t.Fatalf("done task = %+v, want completed at %v", done, late)
	}
	if open := progress.TaskStates[1]; open.Completed || open.CompletedAt != nil {
		t.Fatalf("open task = %+v, want incomplete", open)
	}
	if empty := progress.TaskStates[2]; !empty.Completed || empty.CompletedAt != nil {
		t.Fatalf("question-less task = %+v, want completed without timestamp", empty)
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
