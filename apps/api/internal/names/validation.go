package names

import (
	"errors"
	"regexp"
	"strings"
)

var (
	ErrRequired            = errors.New("Name is required")
	ErrTooLong             = errors.New("Name must be 63 characters or less")
	ErrMustStartWithLetter = errors.New("Name must start with a letter")
	ErrInvalidCharacters   = errors.New("Name can only contain letters, numbers, and hyphens")
)

var (
	startsWithLetterPattern  = regexp.MustCompile(`^[a-zA-Z]`)
	allowedCharactersPattern = regexp.MustCompile(`^[a-zA-Z0-9-]+$`)
)

func Normalize(name string) string {
	return strings.TrimSpace(name)
}

func ValidateFolder(name string) error {
	switch {
	case name == "":
		return ErrRequired
	case len(name) > 63:
		return ErrTooLong
	case !startsWithLetterPattern.MatchString(name):
		return ErrMustStartWithLetter
	case !allowedCharactersPattern.MatchString(name):
		return ErrInvalidCharacters
	default:
		return nil
	}
}

func ValidateVM(name string) error {
	switch {
	case name == "":
		return ErrRequired
	case len(name) > 63:
		return ErrTooLong
	case !allowedCharactersPattern.MatchString(name):
		return ErrInvalidCharacters
	default:
		return nil
	}
}
