package routerconfig

import (
	"fmt"
	"net/netip"
	"strconv"
	"strings"
	"unicode"
)

// ParseIPv4Subnet24 parses value as a canonical IPv4 /24 network address,
// rejecting IPv6, other prefix lengths, and host addresses (e.g.
// 10.128.1.7/24 has a non-zero host part and is rejected).
func ParseIPv4Subnet24(value string) (netip.Prefix, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return netip.Prefix{}, fmt.Errorf("must not be empty")
	}

	prefix, err := netip.ParsePrefix(trimmed)
	if err != nil {
		return netip.Prefix{}, fmt.Errorf("must be a CIDR subnet: %w", err)
	}
	if !prefix.Addr().Is4() {
		return netip.Prefix{}, fmt.Errorf("must be an IPv4 subnet")
	}
	if prefix.Bits() != 24 {
		return netip.Prefix{}, fmt.Errorf("must be a /24 subnet")
	}
	if prefix.Masked() != prefix {
		return netip.Prefix{}, fmt.Errorf("must be a network address, not a host address")
	}

	return prefix, nil
}

func NormalizeDottedPrefix(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}

	trimmed = strings.TrimSuffix(trimmed, ".")
	segments := strings.Split(trimmed, ".")
	if len(segments) == 0 {
		return "", fmt.Errorf("must be a dotted numeric prefix")
	}

	for _, segment := range segments {
		if strings.TrimSpace(segment) == "" {
			return "", fmt.Errorf("must be a dotted numeric prefix")
		}
		octet, err := strconv.Atoi(segment)
		if err != nil || octet < 0 || octet > 255 {
			return "", fmt.Errorf("must be a dotted numeric prefix")
		}
	}

	return strings.Join(segments, ".") + ".", nil
}

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

func NormalizeCloudInitStorage(value string) string {
	return strings.TrimSpace(value)
}

func NormalizeCloudInitFilePattern(envName, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s must not be empty", envName)
	}
	if strings.Count(trimmed, "{network}") != 1 {
		return "", fmt.Errorf("%s must contain {network} exactly once", envName)
	}
	filename := strings.Replace(trimmed, "{network}", "24", 1)
	if err := ValidateCloudInitSnippetFilename(filename); err != nil {
		return "", fmt.Errorf("%s %w", envName, err)
	}
	return trimmed, nil
}

func NormalizeCloudInitFileName(envName, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s must not be empty", envName)
	}
	if strings.Contains(trimmed, "{network}") {
		return "", fmt.Errorf("%s must not contain {network}", envName)
	}
	if err := ValidateCloudInitSnippetFilename(trimmed); err != nil {
		return "", fmt.Errorf("%s %w", envName, err)
	}
	return trimmed, nil
}
