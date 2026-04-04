package proxmox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Client talks to the Proxmox VE API.
type Client struct {
	baseURL    string
	tokenID    string
	secret     string
	insecure   bool
	httpClient *http.Client
}

// NewClient creates a Proxmox API client.
// Set insecure to true to skip TLS certificate verification (common for self-signed certs).
func NewClient(baseURL, tokenID, secret string, insecure bool) *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if insecure {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	return &Client{
		baseURL:    baseURL,
		tokenID:    tokenID,
		secret:     secret,
		insecure:   insecure,
		httpClient: &http.Client{Transport: transport},
	}
}

// BaseURL returns the Proxmox API base URL.
func (c *Client) BaseURL() string { return c.baseURL }

// AuthHeader returns the Authorization header value for Proxmox API requests.
func (c *Client) AuthHeader() string {
	return fmt.Sprintf("PVEAPIToken=%s=%s", c.tokenID, c.secret)
}

// Insecure returns whether TLS verification is disabled.
func (c *Client) Insecure() bool { return c.insecure }

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
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, path)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}
	return nil
}

func (c *Client) post(ctx context.Context, path string, formData map[string]string, result any) error {
	form := make([]string, 0, len(formData))
	for k, v := range formData {
		form = append(form, k+"="+v)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, strings.NewReader(strings.Join(form, "&")))
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
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, path)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}
	return nil
}

// GetPools returns all resource pools from Proxmox.
func (c *Client) GetPools(ctx context.Context) ([]Pool, error) {
	var resp apiResponse[[]Pool]
	if err := c.get(ctx, "/api2/json/pools", &resp); err != nil {
		return nil, fmt.Errorf("fetching pools: %w", err)
	}
	return resp.Data, nil
}

// GetVMs returns all virtual machines across the cluster.
func (c *Client) GetVMs(ctx context.Context) ([]VM, error) {
	var resp apiResponse[[]VM]
	if err := c.get(ctx, "/api2/json/cluster/resources?type=vm", &resp); err != nil {
		return nil, fmt.Errorf("fetching VMs: %w", err)
	}
	return resp.Data, nil
}

// VNCProxyResponse holds the data returned by Proxmox's vncproxy endpoint.
type VNCProxyResponse struct {
	Port     string `json:"port"`
	Ticket   string `json:"ticket"`
	Password string `json:"password"`
}

// CreateVNCProxy requests a VNC proxy session from Proxmox for a given VM.
func (c *Client) CreateVNCProxy(ctx context.Context, node string, vmid int) (*VNCProxyResponse, error) {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/vncproxy", node, vmid)
	var resp apiResponse[VNCProxyResponse]
	if err := c.post(ctx, path, map[string]string{
		"generate-password": "1",
		"websocket":         "1",
	}, &resp); err != nil {
		return nil, fmt.Errorf("creating VNC proxy: %w", err)
	}
	return &resp.Data, nil
}
