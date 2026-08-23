package proxmox

import (
	"context"
	"fmt"
	"net"
	"strings"
	"unicode"
)

type SPICEProxyResponse struct {
	Type             string `json:"type"`
	Title            string `json:"title"`
	Host             string `json:"host"`
	Proxy            string `json:"proxy"`
	TLSPort          int    `json:"tls-port"`
	HostSubject      string `json:"host-subject"`
	CA               string `json:"ca"`
	Password         string `json:"password"`
	DeleteThisFile   int    `json:"delete-this-file"`
	SecureAttention  string `json:"secure-attention"`
	ToggleFullscreen string `json:"toggle-fullscreen"`
	ReleaseCursor    string `json:"release-cursor"`
}

func (c *Client) CreateSPICEProxy(
	ctx context.Context,
	gt GuestType,
	node string,
	vmid int,
	proxyHost string,
) (*SPICEProxyResponse, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	if err := validateSPICEProxyHost(proxyHost); err != nil {
		return nil, err
	}

	path := guestPath(gt, node, vmid, "/spiceproxy")
	form := map[string]string{"proxy": strings.TrimSpace(proxyHost)}

	var resp apiResponse[SPICEProxyResponse]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return nil, fmt.Errorf("creating SPICE proxy: %w", err)
	}

	if err := validateSPICEProxyResponse(&resp.Data); err != nil {
		return nil, fmt.Errorf("creating SPICE proxy: %w", err)
	}

	return &resp.Data, nil
}

func validateSPICEProxyHost(raw string) error {
	host := strings.TrimSpace(raw)
	if host == "" {
		return fmt.Errorf("proxy host is required")
	}
	if strings.ContainsAny(host, ":/\\?#@\r\n[]") {
		return fmt.Errorf("proxy host must be a host-only value")
	}
	for _, r := range host {
		if unicode.IsControl(r) {
			return fmt.Errorf("proxy host must not contain control characters")
		}
	}
	if ip := net.ParseIP(host); ip != nil {
		return nil
	}
	if strings.Contains(host, ":") {
		return fmt.Errorf("proxy host must not include a port")
	}
	return nil
}

func validateSPICEProxyResponse(resp *SPICEProxyResponse) error {
	if resp == nil {
		return fmt.Errorf("empty SPICE proxy response")
	}
	if resp.Type != "spice" {
		return fmt.Errorf("unexpected SPICE proxy type %q", resp.Type)
	}
	if strings.TrimSpace(resp.Host) == "" {
		return fmt.Errorf("missing SPICE host")
	}
	if strings.TrimSpace(resp.Proxy) == "" {
		return fmt.Errorf("missing SPICE proxy")
	}
	if strings.TrimSpace(resp.HostSubject) == "" {
		return fmt.Errorf("missing SPICE host subject")
	}
	if strings.TrimSpace(resp.CA) == "" {
		return fmt.Errorf("missing SPICE CA")
	}
	if strings.TrimSpace(resp.Password) == "" {
		return fmt.Errorf("missing SPICE password")
	}
	if resp.TLSPort < 1 || resp.TLSPort > 65535 {
		return fmt.Errorf("invalid SPICE TLS port %d", resp.TLSPort)
	}
	return nil
}
