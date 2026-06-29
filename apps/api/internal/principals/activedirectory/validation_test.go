package activedirectory

import (
	"errors"
	"strings"
	"testing"

	"github.com/go-ldap/ldap/v3"
)

func TestValidateADCreateName_Valid(t *testing.T) {
	valid := []string{
		"alice",
		"bob.jones",
		"Admin123",
		"a",
		"User-01",
		"Group_1",
	}
	for _, name := range valid {
		if err := ValidateADCreateName(name); err != nil {
			t.Errorf("ValidateADCreateName(%q) unexpected error: %v", name, err)
		}
	}
}

func TestValidateADCreateName_Empty(t *testing.T) {
	if err := ValidateADCreateName(""); err == nil {
		t.Error("expected error for empty name")
	}
	if err := ValidateADCreateName("   "); err == nil {
		t.Error("expected error for whitespace-only name")
	}
}

func TestValidateADCreateName_RejectedCharacters(t *testing.T) {
	rejected := []string{
		"alice,bob",
		"alice+bob",
		`alice"bob`,
		`alice\bob`,
		"alice<bob",
		"alice>bob",
		"alice;bob",
		"alice=bob",
	}
	for _, name := range rejected {
		if err := ValidateADCreateName(name); err == nil {
			t.Errorf("expected error for name %q", name)
		}
	}
}

func TestValidateADCreateName_LeadingTrailingSpace(t *testing.T) {
	if err := ValidateADCreateName(" alice"); err == nil {
		t.Error("expected error for leading space")
	}
	if err := ValidateADCreateName("alice "); err == nil {
		t.Error("expected error for trailing space")
	}
}

func TestValidateADCreateName_LeadingHash(t *testing.T) {
	if err := ValidateADCreateName("#alice"); err == nil {
		t.Error("expected error for leading #")
	}
}

func TestValidateADCreateName_TooLong(t *testing.T) {
	name := strings.Repeat("a", maxSAMAccountNameLen+1)
	if err := ValidateADCreateName(name); err == nil {
		t.Error("expected error for name exceeding max length")
	}
}

func TestValidateADCreateName_MaxLength(t *testing.T) {
	name := strings.Repeat("a", maxSAMAccountNameLen)
	if err := ValidateADCreateName(name); err != nil {
		t.Errorf("unexpected error for name at max length: %v", err)
	}
}

func TestValidateADCreateName_NullByte(t *testing.T) {
	if err := ValidateADCreateName("alice\x00bob"); err == nil {
		t.Error("expected error for null byte")
	}
}

func TestValidateADCreateName_IsInvalidADName(t *testing.T) {
	err := ValidateADCreateName("bad,name")
	if err == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(err, ErrInvalidADName) {
		t.Errorf("expected ErrInvalidADName, got: %v", err)
	}
}

func TestEscapeDNForCN(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"alice", "alice"},
		{"alice,bob", `alice\,bob`},
		{"alice+bob", `alice\+bob`},
		{`alice"bob`, `alice\"bob`},
		{`alice\bob`, `alice\\bob`},
		{"alice<bob", `alice\<bob`},
		{"alice>bob", `alice\>bob`},
		{"alice;bob", `alice\;bob`},
	}
	for _, tt := range tests {
		got := ldap.EscapeDN(tt.input)
		if got != tt.want {
			t.Errorf("EscapeDN(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
