package handlers

import (
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/google/uuid"
)

func TestManagerCloneFolderName(t *testing.T) {
	tests := []struct {
		name         string
		displayLabel string
		want         string
		wantErr      bool
	}{
		{
			name:         "valid user name",
			displayLabel: "alice",
			want:         "alice",
		},
		{
			name:         "valid group-style name",
			displayLabel: "Platform-Team",
			want:         "Platform-Team",
		},
		{
			name:         "spaces are sanitized",
			displayLabel: "Platform Team",
			want:         "Platform-Team",
		},
		{
			name:         "punctuation is sanitized",
			displayLabel: "O'Brien & Associates!",
			want:         "O-Brien-Associates",
		},
		{
			name:         "underscores are preserved",
			displayLabel: "team_blue",
			want:         "team_blue",
		},
		{
			name:         "leading digits are preserved",
			displayLabel: "123user",
			want:         "123user",
		},
		{
			name:         "long name is truncated without suffix",
			displayLabel: strings.Repeat("a", 100),
			want:         strings.Repeat("a", 63),
		},
		{
			name:         "empty input",
			displayLabel: "",
			wantErr:      true,
		},
		{
			name:         "punctuation-only input",
			displayLabel: "!!!",
			wantErr:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := managerCloneFolderName(tt.displayLabel)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q; want %q", got, tt.want)
			}
			if err := names.ValidateFolder(got); err != nil {
				t.Errorf("ValidateFolder(%q) = %v; want nil", got, err)
			}
			if len(got) > 63 {
				t.Errorf("len(%q) = %d; want <= 63", got, len(got))
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

func TestCloneOwnerFromPrincipal(t *testing.T) {
	id := uuid.New()

	t.Run("uses combined full name when present", func(t *testing.T) {
		name := "mcaron"
		fullName := "Maxwell Caron"
		row := database.ListPrincipalDetailsByIDsRow{
			ID:            id,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    "mcaron@ad",
			Name:          &name,
			FullName:      &fullName,
		}
		got := cloneOwnerFromPrincipal(row)
		if got.Label != "mcaron (Maxwell Caron)" {
			t.Errorf("Label = %q, want %q", got.Label, "mcaron (Maxwell Caron)")
		}
		if got.Description != "mcaron@ad" {
			t.Errorf("Description = %q, want %q", got.Description, "mcaron@ad")
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
	t.Run("suppresses duplicate full name label", func(t *testing.T) {
		name := "mcaron"
		fullName := "MCARON"
		row := database.ListPrincipalDetailsByIDsRow{
			ID:            id,
			PrincipalType: database.PrincipalTypeUser,
			ExternalID:    "mcaron@ad",
			Name:          &name,
			FullName:      &fullName,
		}
		got := cloneOwnerFromPrincipal(row)
		if got.Label != "mcaron" {
			t.Errorf("Label = %q, want %q", got.Label, "mcaron")
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
