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

func (c *Client) BaseURL() string { return c.baseURL }

func (c *Client) AuthHeader() string {
	return fmt.Sprintf("PVEAPIToken=%s=%s", c.tokenID, c.secret)
}

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
		return &apiStatusError{statusCode: resp.StatusCode, message: fmt.Sprintf("unexpected status %d for %s (reading response body: %v)", resp.StatusCode, path, err), cause: err}
	}

	return unexpectedStatusErrorWithBody(resp.StatusCode, path, string(body))
}

type apiStatusError struct {
	statusCode int
	message    string
	cause      error
}

func (e *apiStatusError) Error() string { return e.message }

func (e *apiStatusError) Unwrap() error { return e.cause }

func unexpectedStatusErrorWithBody(statusCode int, path string, body string) error {
	detail := strings.TrimSpace(body)
	if detail == "" {
		return &apiStatusError{statusCode: statusCode, message: fmt.Sprintf("unexpected status %d for %s", statusCode, path)}
	}
	return &apiStatusError{statusCode: statusCode, message: fmt.Sprintf("unexpected status %d for %s: %s", statusCode, path, detail)}
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
	return c.request(ctx, http.MethodGet, path, nil, result)
}

func (c *Client) post(ctx context.Context, path string, formData map[string]string, result any) error {
	return c.postValues(ctx, path, formValues(formData), result)
}

func (c *Client) postValues(ctx context.Context, path string, form url.Values, result any) error {
	if form == nil {
		form = url.Values{}
	}
	return c.request(ctx, http.MethodPost, path, form, result)
}

func (c *Client) put(ctx context.Context, path string, formData map[string]string, result any) error {
	return c.request(ctx, http.MethodPut, path, formValues(formData), result)
}

func (c *Client) delete(ctx context.Context, path string, result any) error {
	return c.request(ctx, http.MethodDelete, path, nil, result)
}

func formValues(values map[string]string) url.Values {
	form := url.Values{}
	for key, value := range values {
		form.Set(key, value)
	}
	return form
}

func (c *Client) request(ctx context.Context, method, path string, form url.Values, result any) error {
	req, err := c.newRequest(ctx, method, path, form)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.AuthHeader())
	return c.do(req, result)
}

func (c *Client) newRequest(ctx context.Context, method, path string, form url.Values) (*http.Request, error) {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	return req, nil
}

func (c *Client) do(req *http.Request, result any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, req.URL.RequestURI())
	}
	if result != nil {
		if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
			return fmt.Errorf("decoding response: %w", err)
		}
	}
	return nil
}
