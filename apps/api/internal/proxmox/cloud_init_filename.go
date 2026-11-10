package proxmox

import (
	"fmt"
	"strings"
	"unicode"
)

func ValidateCloudInitSnippetFilename(filename string) error {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return fmt.Errorf("filename is required")
	}
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return fmt.Errorf("filename must not contain path separators")
	}
	if strings.Contains(filename, "..") {
		return fmt.Errorf("filename must not contain '..'")
	}
	if strings.IndexFunc(filename, unicode.IsSpace) >= 0 {
		return fmt.Errorf("filename must not contain whitespace")
	}
	return nil
}
