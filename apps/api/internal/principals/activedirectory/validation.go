package activedirectory

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
)

var ErrInvalidADName = errors.New("invalid AD name")

const maxSAMAccountNameLen = 20

// ValidateADCreateName checks that a name is safe
func ValidateADCreateName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fmt.Errorf("%w: name must not be empty", ErrInvalidADName)
	}

	if len(trimmed) > maxSAMAccountNameLen {
		return fmt.Errorf("%w: name must not exceed %d characters", ErrInvalidADName, maxSAMAccountNameLen)
	}

	if trimmed != name {
		return fmt.Errorf("%w: name must not have leading or trailing whitespace", ErrInvalidADName)
	}

	if strings.HasPrefix(name, "#") {
		return fmt.Errorf("%w: name must not start with #", ErrInvalidADName)
	}

	for _, r := range name {
		switch {
		case r == ',' || r == '+' || r == '"' || r == '\\' || r == '<' || r == '>' || r == ';' || r == '=':
			return fmt.Errorf("%w: name must not contain %q", ErrInvalidADName, string(r))
		case r == '\x00':
			return fmt.Errorf("%w: name must not contain null bytes", ErrInvalidADName)
		case unicode.IsControl(r):
			return fmt.Errorf("%w: name must not contain control characters", ErrInvalidADName)
		}
	}

	return nil
}
