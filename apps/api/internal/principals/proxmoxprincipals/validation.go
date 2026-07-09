package proxmoxprincipals

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
)

var ErrInvalidProxmoxName = errors.New("invalid proxmox principal name")

func ValidateProxmoxUserID(userid string) error {
	trimmed := strings.TrimSpace(userid)
	if trimmed == "" {
		return fmt.Errorf("%w: user id must not be empty", ErrInvalidProxmoxName)
	}
	if trimmed != userid {
		return fmt.Errorf("%w: user id must not have leading or trailing whitespace", ErrInvalidProxmoxName)
	}
	if !strings.Contains(userid, "@") {
		return fmt.Errorf("%w: user id must include a realm suffix", ErrInvalidProxmoxName)
	}
	local, realm, ok := strings.Cut(userid, "@")
	if !ok || strings.TrimSpace(local) == "" || strings.TrimSpace(realm) == "" {
		return fmt.Errorf("%w: user id must be in user@realm format", ErrInvalidProxmoxName)
	}
	return validatePrincipalToken(local)
}

func ValidateProxmoxGroupID(groupid string) error {
	trimmed := strings.TrimSpace(groupid)
	if trimmed == "" {
		return fmt.Errorf("%w: group id must not be empty", ErrInvalidProxmoxName)
	}
	if trimmed != groupid {
		return fmt.Errorf("%w: group id must not have leading or trailing whitespace", ErrInvalidProxmoxName)
	}
	if strings.Contains(groupid, "@") {
		return fmt.Errorf("%w: group id must not contain @", ErrInvalidProxmoxName)
	}
	return validatePrincipalToken(groupid)
}

func normalizeManagedUserID(username, managedRealm string) string {
	username = strings.TrimSpace(username)
	managedRealm = strings.TrimSpace(managedRealm)
	if strings.Contains(username, "@") {
		return username
	}
	if managedRealm == "" {
		return username
	}
	return username + "@" + managedRealm
}

func validatePrincipalToken(value string) error {
	for _, r := range value {
		switch {
		case r == '/' || r == '\\' || r == ' ':
			return fmt.Errorf("%w: name must not contain whitespace or path separators", ErrInvalidProxmoxName)
		case unicode.IsControl(r):
			return fmt.Errorf("%w: name must not contain control characters", ErrInvalidProxmoxName)
		}
	}
	return nil
}

func accessUserFullName(firstName, lastName string) string {
	parts := make([]string, 0, 2)
	if value := strings.TrimSpace(firstName); value != "" {
		parts = append(parts, value)
	}
	if value := strings.TrimSpace(lastName); value != "" {
		parts = append(parts, value)
	}
	return strings.Join(parts, " ")
}
