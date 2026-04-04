package proxmox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
)

// Client talks to the Proxmox VE API.
type Client struct {
	baseURL    string
	tokenID    string
	secret     string
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
		httpClient: &http.Client{Transport: transport},
	}
}

func (c *Client) get(ctx context.Context, path string, result any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("PVEAPIToken=%s=%s", c.tokenID, c.secret))

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
