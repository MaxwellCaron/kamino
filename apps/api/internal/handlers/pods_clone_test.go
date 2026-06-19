package handlers

import (
	"strings"
	"testing"

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
