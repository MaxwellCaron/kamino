package proxmox

import (
	"fmt"
	"regexp"
)

var vnetIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*$`)

func ValidateVNetID(id string) error {
	if len(id) < 2 || len(id) > 8 {
		return fmt.Errorf("VNet ID must be 2-8 characters")
	}
	if !vnetIDPattern.MatchString(id) {
		return fmt.Errorf("VNet ID must start with a letter and contain only letters and numbers")
	}
	return nil
}

func ValidateVNetTag(tag int) error {
	if tag < 1 || tag > 16777215 {
		return fmt.Errorf("tag must be between 1 and 16777215")
	}
	return nil
}
