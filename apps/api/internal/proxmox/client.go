package proxmox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

const proxmoxResponseHeaderTimeout = 30 * time.Second

var (
	ErrVMIdentityNotConfigured = errors.New("vm upstream uuid is not configured")
	ErrVMIdentityInvalid       = errors.New("vm upstream uuid is invalid")
	ErrLXCRAMSnapshot          = errors.New("RAM snapshots are not supported for containers")
)

func guestPath(gt GuestType, node string, vmid int, suffix string) string {
	return fmt.Sprintf("/api2/json/nodes/%s/%s/%d%s", node, gt, vmid, suffix)
}

// Client talks to the Proxmox VE API.
type Client struct {
	baseURL            string
	tokenID            string
	secret             string
	insecure           bool
	nodes              []string
	nodeIndex          map[string]int
	httpClient         *http.Client
	sharedStorageNames map[string]struct{}
}

// NewClient creates a Proxmox API client.
// Set insecure to true to skip TLS certificate verification (common for self-signed certs).
func NewClient(
	baseURL, tokenID, secret string, insecure bool, nodes []string,
) *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = proxmoxResponseHeaderTimeout
	if insecure {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	nodeIndex := make(map[string]int, len(nodes))
	allowedNodes := make([]string, 0, len(nodes))
	for _, node := range nodes {
		node = strings.TrimSpace(node)
		if node == "" {
			continue
		}
		if _, exists := nodeIndex[node]; exists {
			continue
		}
		nodeIndex[node] = len(allowedNodes)
		allowedNodes = append(allowedNodes, node)
	}

	return &Client{
		baseURL:            baseURL,
		tokenID:            tokenID,
		secret:             secret,
		insecure:           insecure,
		nodes:              allowedNodes,
		nodeIndex:          nodeIndex,
		httpClient:         &http.Client{Transport: transport},
		sharedStorageNames: map[string]struct{}{},
	}
}

func (c *Client) SetSharedStorageNames(names []string) {
	c.sharedStorageNames = parseSharedStorageNames(names)
}

// BaseURL returns the Proxmox API base URL.
func (c *Client) BaseURL() string { return c.baseURL }

// AuthHeader returns the Authorization header value for Proxmox API requests.
func (c *Client) AuthHeader() string {
	return fmt.Sprintf("PVEAPIToken=%s=%s", c.tokenID, c.secret)
}

// Insecure returns whether TLS verification is disabled.
func (c *Client) Insecure() bool { return c.insecure }

func (c *Client) isAllowedNode(node string) bool {
	_, ok := c.nodeIndex[strings.TrimSpace(node)]
	return ok
}

func (c *Client) requireAllowedNode(node string) error {
	node = strings.TrimSpace(node)
	if node == "" {
		return fmt.Errorf("node is required")
	}
	if c.isAllowedNode(node) {
		return nil
	}
	return fmt.Errorf("node %q is not managed by Kamino", node)
}

func unexpectedStatusError(resp *http.Response, path string) error {
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return fmt.Errorf("unexpected status %d for %s (reading response body: %w)", resp.StatusCode, path, err)
	}

	return unexpectedStatusErrorWithBody(resp.StatusCode, path, string(body))
}

func unexpectedStatusErrorWithBody(statusCode int, path string, body string) error {
	detail := strings.TrimSpace(body)
	if detail == "" {
		return fmt.Errorf("unexpected status %d for %s", statusCode, path)
	}
	return fmt.Errorf("unexpected status %d for %s: %s", statusCode, path, detail)
}

func (c *Client) filterNodes(nodes []Node) []Node {
	filtered := make([]Node, 0, len(nodes))
	for _, node := range nodes {
		if c.isAllowedNode(node.Node) {
			filtered = append(filtered, node)
		}
	}

	slices.SortFunc(filtered, func(left, right Node) int {
		return c.nodeIndex[left.Node] - c.nodeIndex[right.Node]
	})
	return filtered
}

func (c *Client) filterVMs(vms []VM) []VM {
	filtered := make([]VM, 0, len(vms))
	for _, vm := range vms {
		if c.isAllowedNode(vm.Node) {
			filtered = append(filtered, vm)
		}
	}
	return filtered
}

func (c *Client) get(ctx context.Context, path string, result any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", c.AuthHeader())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, path)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}
	return nil
}

func (c *Client) post(ctx context.Context, path string, formData map[string]string, result any) error {
	form := url.Values{}
	for k, v := range formData {
		form.Set(k, v)
	}

	return c.postValues(ctx, path, form, result)
}

func (c *Client) postValues(ctx context.Context, path string, form url.Values, result any) error {
	if form == nil {
		form = url.Values{}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", c.AuthHeader())
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, path)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}
	return nil
}

// GetPools returns all resource pools from Proxmox.
func (c *Client) put(ctx context.Context, path string, formData map[string]string, result any) error {
	form := url.Values{}
	for k, v := range formData {
		form.Set(k, v)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", c.AuthHeader())
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, path)
	}

	if result != nil {
		if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
			return fmt.Errorf("decoding response: %w", err)
		}
	}
	return nil
}

func (c *Client) delete(ctx context.Context, path string, result any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", c.AuthHeader())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, path)
	}

	if result != nil {
		if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
			return fmt.Errorf("decoding response: %w", err)
		}
	}
	return nil
}
