package handlers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPublishedPodDeleteDecision(t *testing.T) {
	tests := []struct {
		name        string
		cloneCount  int32
		err         error
		wantStatus  int
		wantMessage string
		wantDecided bool
	}{
		{
			name:        "not found",
			err:         pgx.ErrNoRows,
			wantStatus:  http.StatusNotFound,
			wantMessage: "pod not found",
			wantDecided: true,
		},
		{
			name:        "zero clones proceed",
			cloneCount:  0,
			wantDecided: true,
		},
		{
			name:        "positive clones blocked",
			cloneCount:  2,
			wantStatus:  http.StatusConflict,
			wantMessage: publishedPodDeleteBlockedMessage,
			wantDecided: true,
		},
		{
			name:        "unrelated database error",
			err:         errors.New("connection reset"),
			wantDecided: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, message, decided := publishedPodDeleteDecision(tt.cloneCount, tt.err)
			if decided != tt.wantDecided {
				t.Fatalf("decided = %v, want %v", decided, tt.wantDecided)
			}
			if status != tt.wantStatus {
				t.Fatalf("status = %d, want %d", status, tt.wantStatus)
			}
			if message != tt.wantMessage {
				t.Fatalf("message = %q, want %q", message, tt.wantMessage)
			}
		})
	}
}

func TestPublishedPodDeleteHasCloneConflict(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "restrict violation",
			err:  &pgconn.PgError{Code: "23001"},
			want: true,
		},
		{
			name: "foreign key violation",
			err:  &pgconn.PgError{Code: "23503"},
			want: true,
		},
		{
			name: "unique violation",
			err:  &pgconn.PgError{Code: "23505"},
			want: false,
		},
		{
			name: "unrelated error",
			err:  errors.New("boom"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := publishedPodDeleteHasCloneConflict(tt.err); got != tt.want {
				t.Fatalf("publishedPodDeleteHasCloneConflict() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidatePublishedPodPermissions(t *testing.T) {
	tests := []struct {
		name    string
		perms   publishPodPermissionRequest
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid non-overlapping masks",
			perms:   publishPodPermissionRequest{AllowMask: 3, DenyMask: 12},
			wantErr: false,
		},
		{
			name:    "valid allow only",
			perms:   publishPodPermissionRequest{AllowMask: 7, DenyMask: 0},
			wantErr: false,
		},
		{
			name:    "valid deny only",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: 4},
			wantErr: false,
		},
		{
			name:    "valid both zero",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: 0},
			wantErr: false,
		},
		{
			name:    "negative allow mask",
			perms:   publishPodPermissionRequest{AllowMask: -1, DenyMask: 0},
			wantErr: true,
			errMsg:  "non-negative",
		},
		{
			name:    "negative deny mask",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: -1},
			wantErr: true,
			errMsg:  "non-negative",
		},
		{
			name:    "overlapping masks",
			perms:   publishPodPermissionRequest{AllowMask: 5, DenyMask: 7},
			wantErr: true,
			errMsg:  "overlap",
		},
		{
			name:    "mask exceeds full access",
			perms:   publishPodPermissionRequest{AllowMask: int64(authorization.FullAccessMask) << 1, DenyMask: 0},
			wantErr: true,
			errMsg:  "unsupported bits",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePublishedPodPermissions(tt.perms)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errMsg)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestParsePublishedPodStatus(t *testing.T) {
	tests := []struct {
		input   string
		want    database.PublishedPodStatus
		wantErr bool
	}{
		{"listed", database.PublishedPodStatusListed, false},
		{"unlisted", database.PublishedPodStatusUnlisted, false},
		{" listed ", database.PublishedPodStatusListed, false},
		{" unlisted ", database.PublishedPodStatusUnlisted, false},
		{"draft", "", true},
		{"", "", true},
		{"LISTED", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parsePublishedPodStatus(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for input %q, got %v", tt.input, got)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got != tt.want {
					t.Errorf("got %q, want %q", got, tt.want)
				}
			}
		})
	}
}

func TestPublishedPodQuestionAnswerStateChanged(t *testing.T) {
	existing := database.ListPublishedPodQuestionsByTaskIDsRow{
		Title:         "What is 2+2?",
		AnswerOutline: "4",
	}

	t.Run("no change returns false", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "4"}
		if publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected false for unchanged question")
		}
	})
	t.Run("title change returns true", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 3+3?", AnswerOutline: "4"}
		if !publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected true for title change")
		}
	})
	t.Run("answer change returns true", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "five"}
		if !publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected true for answer change")
		}
	})
	t.Run("case-insensitive answer match returns false", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "4"}
		if publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected false for case-insensitive match")
		}
	})
}

func TestInvalidPublishPod(t *testing.T) {
	err := invalidPublishPod("test message")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if err.Status != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", err.Status, http.StatusUnprocessableEntity)
	}
	if err.UserMessage != "test message" {
		t.Errorf("UserMessage = %q, want %q", err.UserMessage, "test message")
	}
}

func TestPublishedPodTemplateIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()

	t.Run("extracts non-nil IDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: id2},
		}
		got := publishedPodTemplateIDs(vms)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("skips nil UUIDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: uuid.Nil},
			{SourceInventoryItemID: id2},
		}
		got := publishedPodTemplateIDs(vms)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("empty input", func(t *testing.T) {
		got := publishedPodTemplateIDs(nil)
		if len(got) != 0 {
			t.Fatalf("len = %d, want 0", len(got))
		}
	})
}

func TestNewPublishedPodTemplateIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	existing := []database.ListPublishedPodVMsByPodIDsRow{
		{SourceInventoryItemID: id1},
	}

	t.Run("excludes existing", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: id2},
			{SourceInventoryItemID: id3},
		}
		got := newPublishedPodTemplateIDs(vms, existing)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("skips nil UUIDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: uuid.Nil},
			{SourceInventoryItemID: id2},
		}
		got := newPublishedPodTemplateIDs(vms, existing)
		if len(got) != 1 {
			t.Fatalf("len = %d, want 1", len(got))
		}
	})
}

func TestMarkSelectedUpdateVM(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()
	selected := map[uuid.UUID]struct{}{id1: {}, id2: {}}

	t.Run("marks matching IDs", func(t *testing.T) {
		matched := make(map[uuid.UUID]struct{})
		got := markSelectedUpdateVM(selected, matched, id1, id3)
		if !got {
			t.Error("expected true")
		}
		if _, ok := matched[id1]; !ok {
			t.Error("expected id1 in matched")
		}
		if _, ok := matched[id3]; ok {
			t.Error("id3 should not be in matched")
		}
	})
	t.Run("returns false when no match", func(t *testing.T) {
		matched := make(map[uuid.UUID]struct{})
		got := markSelectedUpdateVM(selected, matched, id3)
		if got {
			t.Error("expected false")
		}
	})
}
