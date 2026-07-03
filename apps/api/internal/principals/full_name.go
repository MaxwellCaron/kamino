package principals

import (
	"errors"
	"strings"
	"unicode/utf8"
)

const MaxFullNameLength = 128

var ErrFullNameTooLong = errors.New("full name must be 128 characters or fewer")

func NormalizeFullName(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	if utf8.RuneCountInString(trimmed) > MaxFullNameLength {
		return "", ErrFullNameTooLong
	}

	return trimmed, nil
}

func FormatReference(name, fullName *string, externalID string) string {
	base := externalID
	if name != nil {
		trimmedName := strings.TrimSpace(*name)
		if trimmedName != "" {
			base = trimmedName
		}
	}

	if fullName == nil {
		return base
	}

	trimmedFullName := strings.TrimSpace(*fullName)
	if trimmedFullName == "" {
		return base
	}
	if strings.EqualFold(trimmedFullName, base) {
		return base
	}

	return base + " (" + trimmedFullName + ")"
}
