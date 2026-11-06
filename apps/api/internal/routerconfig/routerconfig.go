package routerconfig

import (
	"fmt"
	"net/netip"
	"strings"
	"unicode"
)

// ParseIPv4Subnet24 parses value as a canonical IPv4 /24 network address,
// rejecting IPv6, other prefix lengths, and host addresses (e.g.
// 192.168.1.7/24 has a non-zero host part and is rejected).
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

// ParseIPv4Subnet16 parses value as a canonical IPv4 /16 network address. Pod
// WAN subnets are /16 so the network number can fill the third octet.
func ParseIPv4Subnet16(value string) (netip.Prefix, error) {
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
	if prefix.Bits() != 16 {
		return netip.Prefix{}, fmt.Errorf("must be a /16 subnet")
	}
	if prefix.Masked() != prefix {
		return netip.Prefix{}, fmt.Errorf("must be a network address, not a host address")
	}

	return prefix, nil
}

// PodWANSubnet carves the pod's /24 out of a /16 WAN subnet using its network
// number as the third octet.
func PodWANSubnet(wanSubnet string, networkNumber int32) (netip.Prefix, error) {
	prefix, err := ParseIPv4Subnet16(wanSubnet)
	if err != nil {
		return netip.Prefix{}, err
	}
	if networkNumber < 1 || networkNumber > 254 {
		return netip.Prefix{}, fmt.Errorf("network number %d is out of range", networkNumber)
	}

	octets := prefix.Addr().As4()
	octets[2] = byte(networkNumber)
	octets[3] = 0
	return netip.PrefixFrom(netip.AddrFrom4(octets), 24), nil
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
