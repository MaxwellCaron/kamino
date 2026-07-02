package names

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateFolder(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr error
	}{
		{name: "simple name", input: "Dev", wantErr: nil},
		{name: "hyphen in body", input: "dev-environment", wantErr: nil},
		{name: "underscore in body", input: "dev_environment", wantErr: nil},
		{name: "leading digit", input: "123-lab", wantErr: nil},
		{name: "leading underscore", input: "_hidden", wantErr: nil},
		{name: "mixed underscore and hyphen", input: "a_b-c", wantErr: nil},
		{name: "empty", input: "", wantErr: ErrRequired},
		{name: "whitespace only (pre-trimmed)", input: "", wantErr: ErrRequired},
		{name: "too long", input: strings.Repeat("a", 64), wantErr: ErrTooLong},
		{name: "leading hyphen", input: "-leading-hyphen", wantErr: ErrMustStartWithAlnum},
		{name: "slash", input: "has/slash", wantErr: ErrInvalidCharacters},
		{name: "space", input: "name with space", wantErr: ErrInvalidCharacters},
		{name: "dot", input: "name.dot", wantErr: ErrInvalidCharacters},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateFolder(tt.input)
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("ValidateFolder(%q) = %v, want %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestNormalize(t *testing.T) {
	if got := Normalize("  Dev  "); got != "Dev" {
		t.Errorf("Normalize(%q) = %q, want %q", "  Dev  ", got, "Dev")
	}
}
