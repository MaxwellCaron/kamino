package main

import (
	"fmt"
	"net"
	"net/url"
	"strings"
	"unicode"
)

func resolveSPICEProxyHost(proxmoxURL, configured string) (string, error) {
	if strings.TrimSpace(configured) != "" {
		return validateSPICEProxyHost(configured)
	}

	parsed, err := url.Parse(strings.TrimSpace(proxmoxURL))
	if err != nil {
		return "", fmt.Errorf("parse PROXMOX_URL for SPICE proxy host: %w", err)
	}

	host := parsed.Hostname()
	if host == "" {
		return "", fmt.Errorf("PROXMOX_URL must include a hostname when PROXMOX_SPICE_PROXY_HOST is unset")
	}

	return validateSPICEProxyHost(host)
}

func validateSPICEProxyHost(raw string) (string, error) {
	if strings.ContainsAny(raw, "\r\n") {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must not contain control characters")
	}

	host := strings.TrimSpace(raw)
	if host == "" {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST is required")
	}

	if strings.ContainsAny(host, "[]") {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must not use bracketed IPv6 literals")
	}
	for _, r := range host {
		if unicode.IsControl(r) {
			return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must not contain control characters")
		}
	}

	if ip := net.ParseIP(host); ip != nil {
		return host, nil
	}

	if strings.Contains(host, "://") || strings.ContainsAny(host, "/\\?#@") {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must be a host-only value without scheme, path, query, port, or credentials")
	}
	if strings.Contains(host, ":") {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must not include a port")
	}

	if !isDNSHostname(host) {
		return "", fmt.Errorf("PROXMOX_SPICE_PROXY_HOST must be a DNS hostname or IP literal")
	}

	return host, nil
}

func isDNSHostname(host string) bool {
	if len(host) == 0 || len(host) > 253 {
		return false
	}

	labels := strings.Split(host, ".")
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 {
			return false
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '-' {
				return false
			}
		}
	}

	return true
}
