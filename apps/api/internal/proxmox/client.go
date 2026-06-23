package proxmox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrVMIdentityNotConfigured = errors.New("vm upstream uuid is not configured")
	ErrVMIdentityInvalid       = errors.New("vm upstream uuid is invalid")
)

// Client talks to the Proxmox VE API.
type Client struct {
	baseURL    string
	tokenID    string
	secret     string
	insecure   bool
	nodes      []string
	nodeIndex  map[string]int
	httpClient *http.Client
}

// NewClient creates a Proxmox API client.
// Set insecure to true to skip TLS certificate verification (common for self-signed certs).
func NewClient(
	baseURL, tokenID, secret string, insecure bool, nodes []string,
) *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
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
		baseURL:    baseURL,
		tokenID:    tokenID,
		secret:     secret,
		insecure:   insecure,
		nodes:      allowedNodes,
		nodeIndex:  nodeIndex,
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
	return c.filterVMs(resp.Data), nil
}

// GetVMRuntimeStatus returns the node-local QEMU runtime status for a VM.
func (c *Client) GetVMRuntimeStatus(ctx context.Context, node string, vmid int) (string, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return "", err
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/current", node, vmid)
	var resp apiResponse[map[string]any]
	if err := c.get(ctx, path, &resp); err != nil {
		return "", fmt.Errorf("fetching VM runtime status: %w", err)
	}

	status := strings.ToLower(strings.TrimSpace(getStringValue(resp.Data["status"])))
	if status == "" {
		return "", fmt.Errorf("VM %d runtime status response did not include status", vmid)
	}
	return status, nil
}

// WaitForVMRuntimeStatus polls the node-local QEMU runtime status until it matches.
func (c *Client) WaitForVMRuntimeStatus(ctx context.Context, node string, vmid int, expected string, timeout time.Duration) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	expected = strings.ToLower(strings.TrimSpace(expected))
	if expected == "" {
		return fmt.Errorf("expected status is required")
	}
	if timeout <= 0 {
		return fmt.Errorf("timeout must be positive")
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	lastStatus := ""
	for {
		status, err := c.GetVMRuntimeStatus(waitCtx, node, vmid)
		if err != nil {
			return err
		}
		lastStatus = status
		if status == expected {
			return nil
		}

		select {
		case <-waitCtx.Done():
			if lastStatus == "" {
				return fmt.Errorf("waiting for VM %d to reach %s: %w", vmid, expected, waitCtx.Err())
			}
			return fmt.Errorf("waiting for VM %d to reach %s: last status %q: %w", vmid, expected, lastStatus, waitCtx.Err())
		case <-ticker.C:
		}
	}
}

// GetVMConfig returns the raw Proxmox config for a VM.
func (c *Client) GetVMConfig(ctx context.Context, node string, vmid int) (map[string]any, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	var resp apiResponse[map[string]any]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching VM config: %w", err)
	}

	return resp.Data, nil
}

// GetVMIdentity returns the stable identity metadata for a VM.
func (c *Client) GetVMIdentity(ctx context.Context, node string, vmid int) (*VMIdentity, error) {
	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return nil, err
	}

	identity, err := parseVMIdentity(data, vmid)
	if err != nil {
		return nil, err
	}

	return identity, nil
}

// GetVMConfigSummary returns inventory metadata derived from a VM config.
func (c *Client) GetVMConfigSummary(ctx context.Context, node string, vmid int) (*VMConfigSummary, error) {
	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return nil, err
	}

	return parseVMConfigSummary(data, vmid)
}

// EnsureVMUpstreamUUID returns the current VM UUID, assigning one when the VM
// config does not expose a valid SMBIOS UUID yet.
func (c *Client) EnsureVMUpstreamUUID(ctx context.Context, node string, vmid int) (uuid.UUID, error) {
	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return uuid.Nil, err
	}

	current, err := parseVMUpstreamUUID(getStringValue(data["smbios1"]))
	if err == nil {
		return current, nil
	}
	if !errors.Is(err, ErrVMIdentityNotConfigured) && !errors.Is(err, ErrVMIdentityInvalid) {
		return uuid.Nil, err
	}

	upstreamUUID := uuid.New()
	if err := c.SetVMUpstreamUUID(ctx, node, vmid, upstreamUUID); err != nil {
		return uuid.Nil, err
	}

	return upstreamUUID, nil
}

// SetVMUpstreamUUID updates the Proxmox config so the VM exposes the provided
// SMBIOS UUID.
func (c *Client) SetVMUpstreamUUID(ctx context.Context, node string, vmid int, upstreamUUID uuid.UUID) error {
	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return err
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	params := map[string]string{
		"smbios1": withVMUpstreamUUID(getStringValue(data["smbios1"]), upstreamUUID),
	}

	if err := c.put(ctx, path, params, nil); err != nil {
		return fmt.Errorf("setting VM upstream uuid: %w", err)
	}

	return nil
}

// VNCProxyResponse holds the data returned by Proxmox's vncproxy endpoint.
type VNCProxyResponse struct {
	Port     string `json:"port"`
	Ticket   string `json:"ticket"`
	Password string `json:"password"`
}

// CreateSnapshot creates a snapshot of a VM and waits for the task to complete.
func (c *Client) CreateSnapshot(ctx context.Context, node string, vmid int, snapname, description string, vmstate bool) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot", node, vmid)
	form := map[string]string{
		"snapname": snapname,
	}
	if description != "" {
		form["description"] = description
	}
	if vmstate {
		form["vmstate"] = "1"
	}

	var resp apiResponse[string]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return fmt.Errorf("creating snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

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

// CreatePool ensures a pool exists for a folder path mirrored from Kamino.
func (c *Client) CreatePool(ctx context.Context, poolID, comment string) error {
	var resp apiResponse[any]
	return c.post(ctx, "/api2/json/pools", map[string]string{
		"poolid":  poolID,
		"comment": comment,
	}, &resp)
}

// UpdatePoolComment updates metadata for an existing pool.
func (c *Client) UpdatePoolComment(ctx context.Context, poolID, comment string) error {
	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", map[string]string{
		"poolid":  poolID,
		"comment": comment,
	}, &resp)
}

// DeletePool removes an empty pool that is no longer represented by Kamino inventory.
func (c *Client) DeletePool(ctx context.Context, poolID string) error {
	var resp apiResponse[any]
	return c.delete(ctx, poolEndpoint(poolID), &resp)
}

// AddVMToPool adds a VM to a resource pool.
func (c *Client) AddVMToPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", map[string]string{
		"poolid": poolID,
		"vms":    fmt.Sprintf("%d", vmid),
	}, &resp)
}

// RemoveVMFromPool removes a VM from a resource pool.
func (c *Client) RemoveVMFromPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", map[string]string{
		"poolid": poolID,
		"vms":    fmt.Sprintf("%d", vmid),
		"delete": "1",
	}, &resp)
}

func poolEndpoint(poolID string) string {
	query := url.Values{}
	query.Set("poolid", poolID)
	return "/api2/json/pools/?" + query.Encode()
}

// StartVM powers on a VM and waits for the Proxmox task to complete.
func (c *Client) StartVM(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/start", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("starting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// ShutdownVM sends a graceful shutdown signal to a VM and waits for the task to complete.
func (c *Client) ShutdownVM(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/shutdown", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("shutting down VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// RebootVM sends a reboot signal to a VM and waits for the task to complete.
func (c *Client) RebootVM(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/reboot", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rebooting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// StopVM immediately stops a VM and waits for the task to complete.
func (c *Client) StopVM(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/stop", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("stopping VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteVM deletes a VM and waits for the task to complete.
func (c *Client) DeleteVM(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d", node, vmid)
	var resp apiResponse[string]
	if err := c.delete(ctx, path, &resp); err != nil {
		return fmt.Errorf("deleting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteVMStopped checks if a VM is running, stops it if so, and then deletes it.
func (c *Client) DeleteVMStopped(ctx context.Context, node string, vmid int) error {
	status, err := c.GetVMRuntimeStatus(ctx, node, vmid)
	if err != nil {
		return err
	}
	if status == "running" {
		if err := c.StopVM(ctx, node, vmid); err != nil {
			return err
		}
	}
	return c.DeleteVM(ctx, node, vmid)
}

// RenameVM changes the name of a VM.
func (c *Client) RenameVM(ctx context.Context, node string, vmid int, name string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	return c.put(ctx, path, map[string]string{"name": name}, nil)
}

// UpdateVMNotes updates the VM description field used by Proxmox for notes.
func (c *Client) UpdateVMNotes(ctx context.Context, node string, vmid int, notes string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	form := map[string]string{}
	if notes == "" {
		form["delete"] = "description"
	} else {
		form["description"] = notes
	}
	return c.put(ctx, path, form, nil)
}

// GetVMHardwareConfig returns editable VM hardware settings from Proxmox.
func (c *Client) GetVMHardwareConfig(ctx context.Context, node string, vmid int) (*VMHardwareConfig, error) {
	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return nil, err
	}
	return parseVMHardwareConfig(data)
}

func (c *Client) WaitForVMConfigUnlocked(ctx context.Context, node string, vmid int, timeout time.Duration) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if timeout <= 0 {
		return fmt.Errorf("timeout must be positive")
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		data, err := c.GetVMConfig(waitCtx, node, vmid)
		if err != nil {
			return fmt.Errorf("fetching VM config: %w", err)
		}
		if strings.TrimSpace(getStringValue(data["lock"])) == "" {
			return nil
		}

		select {
		case <-waitCtx.Done():
			return fmt.Errorf("waiting for VM config unlock: %w", waitCtx.Err())
		case <-ticker.C:
		}
	}
}

func (c *Client) GetStorageContentByVMID(ctx context.Context, node, storage string, vmid int) ([]StorageContent, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	storage = strings.TrimSpace(storage)
	if storage == "" {
		return nil, fmt.Errorf("storage is required")
	}

	path := fmt.Sprintf(
		"/api2/json/nodes/%s/storage/%s/content?vmid=%d",
		node,
		url.PathEscape(storage),
		vmid,
	)
	var resp apiResponse[[]StorageContent]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching storage content: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) WaitForVMStorageReady(ctx context.Context, node string, vmid int, timeout time.Duration) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if timeout <= 0 {
		return fmt.Errorf("timeout must be positive")
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		data, err := c.GetVMConfig(waitCtx, node, vmid)
		if err != nil {
			return fmt.Errorf("fetching VM config: %w", err)
		}

		_, storage, _, err := parseVMHardwareDiskConfig(data)
		if err != nil {
			return fmt.Errorf("parsing VM disk config: %w", err)
		}

		content, err := c.GetStorageContentByVMID(waitCtx, node, storage, vmid)
		if err != nil {
			return fmt.Errorf("fetching VM storage content: %w", err)
		}

		for _, item := range content {
			if item.Size > 0 {
				return nil
			}
		}

		select {
		case <-waitCtx.Done():
			return fmt.Errorf("waiting for VM storage readiness: %w", waitCtx.Err())
		case <-ticker.C:
		}
	}
}

func validateCloudInitSnippetFileName(filename string) error {
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
	for _, r := range filename {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			return fmt.Errorf("filename must not contain whitespace")
		}
	}
	return nil
}

// EnsureVMCloudInitDrive verifies the VM has a cloud-init disk configured.
func (c *Client) EnsureVMCloudInitDrive(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	data, err := c.GetVMConfig(ctx, node, vmid)
	if err != nil {
		return err
	}

	for _, value := range data {
		if strings.Contains(strings.ToLower(getStringValue(value)), "cloudinit") {
			return nil
		}
	}

	return fmt.Errorf("VM %d has no cloud-init drive configured", vmid)
}

// SetVMCloudInitCustom points a VM's NoCloud config at pre-created Proxmox snippets.
func (c *Client) SetVMCloudInitCustom(
	ctx context.Context,
	node string,
	vmid int,
	storage string,
	userFile string,
	metaFile string,
	networkFile string,
) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	storage = strings.TrimSpace(storage)
	if storage == "" {
		return fmt.Errorf("storage is required")
	}
	if err := validateCloudInitSnippetFileName(userFile); err != nil {
		return fmt.Errorf("invalid user cloud-init snippet filename: %w", err)
	}
	if err := validateCloudInitSnippetFileName(metaFile); err != nil {
		return fmt.Errorf("invalid meta cloud-init snippet filename: %w", err)
	}
	if err := validateCloudInitSnippetFileName(networkFile); err != nil {
		return fmt.Errorf("invalid network cloud-init snippet filename: %w", err)
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	cicustom := fmt.Sprintf(
		"user=%s:snippets/%s,meta=%s:snippets/%s,network=%s:snippets/%s",
		storage,
		userFile,
		storage,
		metaFile,
		storage,
		networkFile,
	)
	if err := c.put(ctx, path, map[string]string{
		"citype":   "nocloud",
		"cicustom": cicustom,
	}, nil); err != nil {
		return fmt.Errorf("updating VM cloud-init custom config: %w", err)
	}

	return nil
}

func (c *Client) SetVMNetworkBridge(ctx context.Context, node string, vmid int, device string, bridge string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	device = strings.TrimSpace(device)
	if device == "" {
		return fmt.Errorf("network device is required")
	}
	bridge = strings.TrimSpace(bridge)
	if bridge == "" {
		return fmt.Errorf("bridge is required")
	}

	current, err := c.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return err
	}

	var target *VMHardwareNetwork
	for i := range current.Networks {
		if current.Networks[i].Device == device {
			target = &current.Networks[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("network device %s is not configured on VM %d", device, vmid)
	}

	updated := *target
	updated.Bridge = bridge
	updated.Firewall = true

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	if err := c.put(ctx, path, map[string]string{
		device: formatVMHardwareNetwork(updated),
	}, nil); err != nil {
		return fmt.Errorf("updating VM network bridge: %w", err)
	}

	return nil
}

// UpdateVMHardware applies editable VM hardware settings through Proxmox.
func (c *Client) UpdateVMHardware(ctx context.Context, node string, vmid int, config VMHardwareConfig) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	current, err := c.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return err
	}

	if config.Storage != current.Storage {
		return fmt.Errorf("changing disk storage is not supported yet")
	}
	if config.DiskSize < current.DiskSize {
		return fmt.Errorf("shrinking disks is not supported")
	}
	if len(config.Networks) == 0 {
		return fmt.Errorf("at least one network interface is required")
	}

	params := map[string]string{
		"ostype": config.OSType,
		"bios":   config.BIOS,
		"scsihw": config.SCSI,
		"cpu":    config.CPUType,
		"memory": fmt.Sprintf("%d", config.Memory*1024),
		"balloon": fmt.Sprintf("%d",
			config.Balloon*1024),
		"sockets": fmt.Sprintf("%d", config.Sockets),
		"cores":   fmt.Sprintf("%d", config.Cores),
	}

	if normalizedMachine := normalizeMachineHardwareValue(config.Machine); normalizedMachine != "" {
		params["machine"] = normalizedMachine
	}

	usedDevices := make(map[string]struct{}, len(config.Networks))
	for _, iface := range config.Networks {
		device := strings.TrimSpace(iface.Device)
		if device == "" {
			device = nextAvailableNetworkDevice(usedDevices, current.Networks)
		}
		usedDevices[device] = struct{}{}
		params[device] = formatVMHardwareNetwork(iface)
	}

	deleteDevices := make([]string, 0, len(current.Networks))
	for _, iface := range current.Networks {
		if _, exists := usedDevices[iface.Device]; !exists {
			deleteDevices = append(deleteDevices, iface.Device)
		}
	}
	if len(deleteDevices) > 0 {
		slices.Sort(deleteDevices)
		params["delete"] = strings.Join(deleteDevices, ",")
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	if err := c.put(ctx, path, params, nil); err != nil {
		return fmt.Errorf("updating VM hardware: %w", err)
	}

	if config.DiskSize > current.DiskSize {
		if err := c.ResizeVMDisk(ctx, node, vmid, current.DiskDevice, config.DiskSize-current.DiskSize); err != nil {
			return err
		}
	}

	return nil
}

// ResizeVMDisk increases the size of a VM disk by the requested number of GB.
func (c *Client) ResizeVMDisk(ctx context.Context, node string, vmid int, disk string, deltaGB int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if deltaGB <= 0 {
		return nil
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/resize", node, vmid)
	form := map[string]string{
		"disk": disk,
		"size": fmt.Sprintf("+%dG", deltaGB),
	}

	var resp apiResponse[string]
	if err := c.put(ctx, path, form, &resp); err != nil {
		return fmt.Errorf("resizing VM disk: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

func parseVMHardwareConfig(data map[string]any) (*VMHardwareConfig, error) {
	config := &VMHardwareConfig{
		OSType:  coalesceString(getStringValue(data["ostype"]), "l26"),
		BIOS:    coalesceString(getStringValue(data["bios"]), "seabios"),
		Machine: normalizeMachineHardwareValue(coalesceString(getStringValue(data["machine"]), "pc")),
		SCSI:    coalesceString(getStringValue(data["scsihw"]), "virtio-scsi-single"),
		Sockets: maxInt(getIntValue(data["sockets"]), 1),
		Cores:   maxInt(getIntValue(data["cores"]), 1),
		CPUType: coalesceString(getStringValue(data["cpu"]), "x86-64-v2-AES"),
		Memory:  mbToGB(getIntValue(data["memory"]), 1),
	}

	if balloonMB := getIntValue(data["balloon"]); balloonMB > 0 {
		config.Balloon = mbToGB(balloonMB, 0)
	}

	diskDevice, storage, diskSize, err := parseVMHardwareDiskConfig(data)
	if err != nil {
		return nil, err
	}
	config.DiskDevice = diskDevice
	config.Storage = storage
	config.DiskSize = diskSize

	networks := make([]VMHardwareNetwork, 0)
	for key, value := range data {
		if !strings.HasPrefix(key, "net") {
			continue
		}

		raw := getStringValue(value)
		if strings.TrimSpace(raw) == "" {
			continue
		}

		network, err := parseVMHardwareNetwork(key, raw)
		if err != nil {
			return nil, err
		}
		networks = append(networks, network)
	}

	slices.SortFunc(networks, func(left, right VMHardwareNetwork) int {
		return strings.Compare(left.Device, right.Device)
	})

	config.Networks = networks
	return config, nil
}

func parseVMIdentity(data map[string]any, vmid int) (*VMIdentity, error) {
	name := strings.TrimSpace(getStringValue(data["name"]))
	if name == "" {
		name = fmt.Sprintf("vm-%d", vmid)
	}

	upstreamUUID, err := parseVMUpstreamUUID(getStringValue(data["smbios1"]))
	if err != nil {
		return nil, err
	}

	return &VMIdentity{
		Name:         name,
		IsTemplate:   getIntValue(data["template"]) == 1,
		UpstreamUUID: upstreamUUID,
	}, nil
}

func parseVMConfigSummary(data map[string]any, vmid int) (*VMConfigSummary, error) {
	identity, err := parseVMIdentity(data, vmid)
	if err != nil {
		return nil, err
	}

	sockets := maxInt(getIntValue(data["sockets"]), 1)
	cores := maxInt(getIntValue(data["cores"]), 1)
	memoryMB := maxInt(getIntValue(data["memory"]), 0)
	_, _, diskSizeGB, err := parseVMHardwareDiskConfig(data)
	if err != nil {
		return nil, err
	}

	return &VMConfigSummary{
		Name:         identity.Name,
		IsTemplate:   identity.IsTemplate,
		UpstreamUUID: identity.UpstreamUUID,
		CPUCount:     int32(sockets * cores),
		MemoryMB:     int32(memoryMB),
		DiskGB:       float64(diskSizeGB),
	}, nil
}

func parseVMUpstreamUUID(raw string) (uuid.UUID, error) {
	segments := strings.Split(strings.TrimSpace(raw), ",")
	for _, segment := range segments {
		key, value, ok := strings.Cut(strings.TrimSpace(segment), "=")
		if !ok || key != "uuid" {
			continue
		}

		upstreamUUID, err := uuid.Parse(strings.TrimSpace(value))
		if err != nil {
			return uuid.Nil, fmt.Errorf("%w: %v", ErrVMIdentityInvalid, err)
		}

		return upstreamUUID, nil
	}

	return uuid.Nil, ErrVMIdentityNotConfigured
}

func withVMUpstreamUUID(raw string, upstreamUUID uuid.UUID) string {
	parts := make([]string, 0, 4)
	for _, segment := range strings.Split(strings.TrimSpace(raw), ",") {
		trimmed := strings.TrimSpace(segment)
		if trimmed == "" {
			continue
		}

		key, _, ok := strings.Cut(trimmed, "=")
		if ok && key == "uuid" {
			continue
		}

		parts = append(parts, trimmed)
	}

	parts = append(parts, "uuid="+upstreamUUID.String())
	return strings.Join(parts, ",")
}

func parseVMHardwareDiskConfig(data map[string]any) (string, string, int, error) {
	if bootDevice := parseBootDiskDevice(data); bootDevice != "" {
		if storage, sizeGB, err := parseVMHardwareDisk(bootDevice, getStringValue(data[bootDevice])); err == nil {
			return bootDevice, storage, sizeGB, nil
		}
	}

	diskDevices := collectEditableDiskDevices(data)
	for _, device := range diskDevices {
		storage, sizeGB, err := parseVMHardwareDisk(device, getStringValue(data[device]))
		if err == nil {
			return device, storage, sizeGB, nil
		}
	}

	return "", "", 0, fmt.Errorf("vm does not expose an editable primary disk")
}

func parseVMHardwareDisk(device, raw string) (string, int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", 0, fmt.Errorf("%s is empty", device)
	}
	if !isEditableDiskValue(raw) {
		return "", 0, fmt.Errorf("%s is not an editable disk", device)
	}

	segments := strings.Split(raw, ",")
	location := strings.TrimSpace(segments[0])
	if location == "" {
		return "", 0, fmt.Errorf("invalid %s configuration", device)
	}

	locationParts := strings.SplitN(location, ":", 2)
	if len(locationParts) < 2 {
		return "", 0, fmt.Errorf("invalid %s storage target", device)
	}

	storage := strings.TrimSpace(locationParts[0])
	for _, segment := range segments[1:] {
		key, value, ok := strings.Cut(strings.TrimSpace(segment), "=")
		if !ok || key != "size" {
			continue
		}

		sizeGB, err := parseSizeToGB(value)
		if err != nil {
			return "", 0, err
		}
		return storage, sizeGB, nil
	}

	return "", 0, fmt.Errorf("%s size metadata is unavailable", device)
}

func parseVMHardwareNetwork(device, raw string) (VMHardwareNetwork, error) {
	parts := strings.Split(raw, ",")
	if len(parts) == 0 {
		return VMHardwareNetwork{}, fmt.Errorf("invalid %s configuration", device)
	}

	model, macAddress := parseNetworkModelAndMAC(parts[0])
	if model == "" {
		return VMHardwareNetwork{}, fmt.Errorf("invalid %s model", device)
	}

	network := VMHardwareNetwork{
		Device:     device,
		Model:      model,
		MACAddress: macAddress,
	}

	for _, part := range parts[1:] {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}

		switch key {
		case "bridge":
			network.Bridge = value
		case "tag":
			if vlanTag, err := strconv.Atoi(value); err == nil && vlanTag > 0 {
				network.VLANTag = &vlanTag
			}
		case "firewall":
			network.Firewall = value == "1" || strings.EqualFold(value, "true")
		}
	}

	return network, nil
}

func parseNetworkModelAndMAC(raw string) (string, string) {
	model, macAddress, hasMAC := strings.Cut(strings.TrimSpace(raw), "=")
	if !hasMAC {
		return model, ""
	}
	return model, strings.TrimSpace(macAddress)
}

func formatVMHardwareNetwork(network VMHardwareNetwork) string {
	model := strings.TrimSpace(network.Model)
	if model == "" {
		model = "virtio"
	}

	base := model
	if macAddress := strings.TrimSpace(network.MACAddress); macAddress != "" {
		base = fmt.Sprintf("%s=%s", model, macAddress)
	}

	parts := []string{base}
	if bridge := strings.TrimSpace(network.Bridge); bridge != "" {
		parts = append(parts, "bridge="+bridge)
	}
	if network.Firewall {
		parts = append(parts, "firewall=1")
	}
	if network.VLANTag != nil && *network.VLANTag > 0 {
		parts = append(parts, fmt.Sprintf("tag=%d", *network.VLANTag))
	}

	return strings.Join(parts, ",")
}

func nextAvailableNetworkDevice(used map[string]struct{}, existing []VMHardwareNetwork) string {
	candidateUsed := make(map[string]struct{}, len(used)+len(existing))
	for key := range used {
		candidateUsed[key] = struct{}{}
	}
	for _, iface := range existing {
		candidateUsed[iface.Device] = struct{}{}
	}

	for index := 0; index < 10; index++ {
		device := fmt.Sprintf("net%d", index)
		if _, exists := used[device]; !exists {
			return device
		}
	}

	for index := 10; ; index++ {
		device := fmt.Sprintf("net%d", index)
		if _, exists := candidateUsed[device]; !exists {
			return device
		}
	}
}

func parseBootDiskDevice(data map[string]any) string {
	if device := strings.TrimSpace(getStringValue(data["bootdisk"])); isSupportedDiskDevice(device) {
		return device
	}

	boot := strings.TrimSpace(getStringValue(data["boot"]))
	if boot == "" {
		return ""
	}

	if _, order, ok := strings.Cut(boot, "order="); ok {
		for _, device := range strings.Split(order, ";") {
			trimmed := strings.TrimSpace(device)
			if isSupportedDiskDevice(trimmed) {
				return trimmed
			}
		}
	}

	return ""
}

func collectEditableDiskDevices(data map[string]any) []string {
	devices := make([]string, 0)
	for key, value := range data {
		if !isSupportedDiskDevice(key) || !isEditableDiskValue(getStringValue(value)) {
			continue
		}
		devices = append(devices, key)
	}

	slices.SortFunc(devices, compareDiskDevices)
	return devices
}

func compareDiskDevices(left, right string) int {
	leftRank, leftIndex := diskDeviceRank(left)
	rightRank, rightIndex := diskDeviceRank(right)

	if leftRank != rightRank {
		return leftRank - rightRank
	}
	if leftIndex != rightIndex {
		return leftIndex - rightIndex
	}
	return strings.Compare(left, right)
}

func diskDeviceRank(device string) (int, int) {
	switch {
	case strings.HasPrefix(device, "scsi"):
		return 0, parseDiskDeviceIndex(device, "scsi")
	case strings.HasPrefix(device, "virtio"):
		return 1, parseDiskDeviceIndex(device, "virtio")
	case strings.HasPrefix(device, "sata"):
		return 2, parseDiskDeviceIndex(device, "sata")
	case strings.HasPrefix(device, "ide"):
		return 3, parseDiskDeviceIndex(device, "ide")
	default:
		return 99, 99
	}
}

func parseDiskDeviceIndex(device, prefix string) int {
	value, err := strconv.Atoi(strings.TrimPrefix(device, prefix))
	if err != nil {
		return 99
	}
	return value
}

func isSupportedDiskDevice(device string) bool {
	switch {
	case strings.HasPrefix(device, "scsi"),
		strings.HasPrefix(device, "virtio"),
		strings.HasPrefix(device, "sata"),
		strings.HasPrefix(device, "ide"):
		return true
	default:
		return false
	}
}

func isEditableDiskValue(raw string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "media=cdrom") || strings.Contains(trimmed, "cloudinit") {
		return false
	}
	return strings.Contains(trimmed, "size=")
}

func normalizeMachineHardwareValue(machine string) string {
	switch trimmed := strings.TrimSpace(machine); {
	case trimmed == "", trimmed == "i440fx", trimmed == "pc", strings.HasPrefix(trimmed, "pc-"):
		return "pc"
	case strings.HasPrefix(trimmed, "q35"):
		return "q35"
	default:
		return trimmed
	}
}

func coalesceString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func getStringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

func getIntValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(math.Round(typed))
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return int(parsed)
	case string:
		parsed, _ := strconv.Atoi(strings.TrimSpace(typed))
		return parsed
	default:
		return 0
	}
}

func mbToGB(valueMB int, fallback int) int {
	if valueMB <= 0 {
		return fallback
	}
	return int(math.Ceil(float64(valueMB) / 1024))
}

func parseSizeToGB(raw string) (int, error) {
	trimmed := strings.TrimSpace(strings.ToUpper(raw))
	if trimmed == "" {
		return 0, fmt.Errorf("disk size is required")
	}

	unit := trimmed[len(trimmed)-1]
	multiplier := 1.0
	valueString := trimmed

	switch unit {
	case 'K':
		multiplier = 1.0 / (1024 * 1024)
		valueString = trimmed[:len(trimmed)-1]
	case 'M':
		multiplier = 1.0 / 1024
		valueString = trimmed[:len(trimmed)-1]
	case 'G':
		multiplier = 1
		valueString = trimmed[:len(trimmed)-1]
	case 'T':
		multiplier = 1024
		valueString = trimmed[:len(trimmed)-1]
	}

	value, err := strconv.ParseFloat(valueString, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid disk size %q", raw)
	}
	return int(math.Ceil(value * multiplier)), nil
}

func maxInt(value, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}

// CloneVM clones a VM and waits for the task to complete.
func (c *Client) CloneVM(
	ctx context.Context,
	node string,
	vmid int,
	newid int,
	name string,
	full bool,
	target string,
) error {
	task, err := c.StartCloneVM(ctx, node, vmid, newid, name, full, target)
	if err != nil {
		return err
	}
	return c.WaitForTask(ctx, task.Node, task.UPID)
}

// CloneTask is a handle to a started Proxmox clone task.
type CloneTask struct {
	Node string
	UPID string
}

// StartCloneVM starts a clone task without waiting; serialize it with VMID
// allocation since Proxmox only reserves newid once the task is created.
func (c *Client) StartCloneVM(
	ctx context.Context,
	node string,
	vmid int,
	newid int,
	name string,
	full bool,
	target string,
) (CloneTask, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return CloneTask{}, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/clone", node, vmid)
	form := map[string]string{
		"newid": fmt.Sprintf("%d", newid),
		"name":  name,
	}
	if full {
		form["full"] = "1"
	}
	taskNode := node
	if target != "" {
		if err := c.requireAllowedNode(target); err != nil {
			return CloneTask{}, err
		}
		form["target"] = target
		taskNode = target
	}
	var resp apiResponse[string]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return CloneTask{}, fmt.Errorf("cloning VM: %w", err)
	}
	return CloneTask{Node: taskNode, UPID: resp.Data}, nil
}

// WaitForTask polls a previously started task until it completes.
func (c *Client) WaitForTask(ctx context.Context, node, upid string) error {
	return c.waitForTask(ctx, node, upid)
}

// ConvertToTemplate converts a VM to a template and waits for completion.
func (c *Client) ConvertToTemplate(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/template", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("converting VM to template: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// GetSnapshots returns all snapshots for a VM.
func (c *Client) GetSnapshots(ctx context.Context, node string, vmid int) ([]Snapshot, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot", node, vmid)
	var resp apiResponse[[]Snapshot]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching snapshots: %w", err)
	}
	return resp.Data, nil
}

// RollbackSnapshot rolls back a VM to a snapshot and waits for the task to complete.
func (c *Client) RollbackSnapshot(ctx context.Context, node string, vmid int, snapname string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot/%s/rollback", node, vmid, snapname)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rolling back snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteSnapshot deletes a snapshot and waits for the task to complete.
func (c *Client) DeleteSnapshot(ctx context.Context, node string, vmid int, snapname string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot/%s", node, vmid, snapname)
	var resp apiResponse[string]
	if err := c.delete(ctx, path, &resp); err != nil {
		return fmt.Errorf("deleting snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// GetNodes returns all cluster nodes.
func (c *Client) GetNodes(ctx context.Context) ([]Node, error) {
	var resp apiResponse[[]Node]
	if err := c.get(ctx, "/api2/json/nodes", &resp); err != nil {
		return nil, fmt.Errorf("fetching nodes: %w", err)
	}
	return c.filterNodes(resp.Data), nil
}

func containsContent(content, item string) bool {
	for _, entry := range strings.Split(content, ",") {
		if strings.TrimSpace(entry) == item {
			return true
		}
	}
	return false
}

// ResolvePrimaryNode returns the first configured Proxmox node.
func (c *Client) ResolvePrimaryNode(ctx context.Context) (Node, error) {
	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return Node{}, err
	}
	if len(nodes) == 0 {
		return Node{}, fmt.Errorf("no managed cluster nodes available")
	}
	if nodes[0].Node != c.nodes[0] {
		return Node{}, fmt.Errorf("primary node %q was not found", c.nodes[0])
	}
	return nodes[0], nil
}

func sortStorages(storages []Storage) {
	slices.SortFunc(storages, func(left, right Storage) int {
		return strings.Compare(left.Storage, right.Storage)
	})
}

// GetStorages returns all storages for a node.
func (c *Client) GetStorages(ctx context.Context, node string) ([]Storage, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/storage", node)
	var resp apiResponse[[]Storage]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching storages: %w", err)
	}
	return resp.Data, nil
}

// GetCreateStorages returns the storages used by the VM create flow from the
// configured metadata node.
func (c *Client) GetCreateStorages(
	ctx context.Context,
	node string,
) (diskStorages []Storage, isoStorages []Storage, err error) {
	storages, err := c.GetStorages(ctx, node)
	if err != nil {
		return nil, nil, fmt.Errorf("fetching storages for %s: %w", node, err)
	}

	for _, storage := range storages {
		if containsContent(storage.Content, "images") {
			diskStorages = append(diskStorages, storage)
		}
		if containsContent(storage.Content, "iso") {
			isoStorages = append(isoStorages, storage)
		}
	}
	sortStorages(diskStorages)
	sortStorages(isoStorages)

	return diskStorages, isoStorages, nil
}

// GetISOs returns ISO files available on a storage.
func (c *Client) GetISOs(ctx context.Context, node, storage string) ([]ISOContent, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/storage/%s/content?content=iso", node, storage)
	var resp apiResponse[[]ISOContent]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching ISOs: %w", err)
	}
	return resp.Data, nil
}

// GetCreateISOs returns the ISO list used by the VM create flow from the
// configured metadata node.
func (c *Client) GetCreateISOs(
	ctx context.Context,
	node, storage string,
) ([]ISOContent, error) {
	isos, err := c.GetISOs(ctx, node, storage)
	if err != nil {
		return nil, fmt.Errorf("fetching ISOs for %s on %s: %w", storage, node, err)
	}
	slices.SortFunc(isos, func(left, right ISOContent) int {
		return strings.Compare(left.Volid, right.Volid)
	})
	return isos, nil
}

// GetBridges returns all network bridges for a node.
func (c *Client) GetBridges(ctx context.Context, node string) ([]NetworkBridge, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/network?type=bridge", node)
	var resp apiResponse[[]NetworkBridge]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching bridges: %w", err)
	}
	return resp.Data, nil
}

// GetCreateNetworks returns bridge options from the configured metadata node
// plus cluster-level VNets.
func (c *Client) GetCreateNetworks(
	ctx context.Context,
	node string,
) ([]NetworkBridge, []VNet, error) {
	bridges, err := c.GetBridges(ctx, node)
	if err != nil {
		return nil, nil, fmt.Errorf("fetching bridges for %s: %w", node, err)
	}
	slices.SortFunc(bridges, func(left, right NetworkBridge) int {
		return strings.Compare(left.Iface, right.Iface)
	})

	vnets, err := c.GetVNets(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("fetching vnets: %w", err)
	}
	slices.SortFunc(vnets, func(left, right VNet) int {
		return strings.Compare(left.VNet, right.VNet)
	})

	return bridges, vnets, nil
}

// GetNextVMID returns the next available VMID from the cluster.
func (c *Client) GetNextVMID(ctx context.Context) (int, error) {
	var resp apiResponse[json.Number]
	if err := c.get(ctx, "/api2/json/cluster/nextid", &resp); err != nil {
		return 0, fmt.Errorf("fetching next VMID: %w", err)
	}
	id, err := resp.Data.Int64()
	if err != nil {
		return 0, fmt.Errorf("parsing next VMID: %w", err)
	}
	return int(id), nil
}

// IsVMIDAvailable returns true if no existing guest currently uses the VMID.
func (c *Client) IsVMIDAvailable(ctx context.Context, vmid int) (bool, error) {
	vms, err := c.GetVMs(ctx)
	if err != nil {
		return false, fmt.Errorf("fetching VMs: %w", err)
	}
	for _, vm := range vms {
		if vm.VMID == vmid {
			return false, nil
		}
	}
	return true, nil
}

// UsedVMIDs returns VMIDs currently present in the Proxmox cluster resource list.
func (c *Client) UsedVMIDs(ctx context.Context) (map[int]struct{}, error) {
	var resp apiResponse[[]VM]
	if err := c.get(ctx, "/api2/json/cluster/resources?type=vm", &resp); err != nil {
		return nil, fmt.Errorf("fetching cluster VM resources: %w", err)
	}

	used := make(map[int]struct{}, len(resp.Data))
	for _, vm := range resp.Data {
		used[vm.VMID] = struct{}{}
	}
	return used, nil
}

// QEMUConfigExistsForVMID checks managed nodes for a QEMU config file. Proxmox
// can leave one behind even when /cluster/nextid returns that VMID.
func (c *Client) QEMUConfigExistsForVMID(ctx context.Context, vmid int) (bool, error) {
	for _, node := range c.nodes {
		exists, err := c.qemuConfigExists(ctx, node, vmid)
		if err != nil {
			return false, fmt.Errorf("checking VMID %d config on %s: %w", vmid, node, err)
		}
		if exists {
			return true, nil
		}
	}

	return false, nil
}

func (c *Client) qemuConfigExists(ctx context.Context, node string, vmid int) (bool, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return false, err
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return false, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", c.AuthHeader())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return false, fmt.Errorf("reading VM config response body: %w", err)
	}
	if isMissingVMIDConfigResponse(resp.StatusCode, string(body)) {
		return false, nil
	}
	return false, unexpectedStatusErrorWithBody(resp.StatusCode, path, string(body))
}

func isMissingVMIDConfigResponse(statusCode int, body string) bool {
	if statusCode == http.StatusNotFound {
		return true
	}

	message := strings.ToLower(body)
	return strings.Contains(message, "does not exist") ||
		strings.Contains(message, "not found") ||
		strings.Contains(message, "no such vm")
}

func IsVMIDCreateConflict(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "config file already exists") ||
		strings.Contains(message, "vmid already exists") ||
		(strings.Contains(message, "unable to create vm") && strings.Contains(message, "already exists"))
}

// CreateVM creates a new virtual machine and waits for the task to complete.
func (c *Client) CreateVM(ctx context.Context, node string, params map[string]string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu", node)
	var resp apiResponse[string]
	if err := c.post(ctx, path, params, &resp); err != nil {
		return fmt.Errorf("creating VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// GetVNets returns all SDN virtual networks.
func (c *Client) GetVNets(ctx context.Context) ([]VNet, error) {
	var resp apiResponse[[]VNet]
	if err := c.get(ctx, "/api2/json/cluster/sdn/vnets", &resp); err != nil {
		return nil, fmt.Errorf("fetching VNets: %w", err)
	}
	return resp.Data, nil
}

// GetSDNZones returns all configured SDN zones.
func (c *Client) GetSDNZones(ctx context.Context) ([]SDNZone, error) {
	var resp apiResponse[[]SDNZone]
	if err := c.get(ctx, "/api2/json/cluster/sdn/zones", &resp); err != nil {
		return nil, fmt.Errorf("fetching SDN zones: %w", err)
	}
	return resp.Data, nil
}

// CreateVNet creates a new SDN virtual network.
func (c *Client) CreateVNet(ctx context.Context, params map[string]string) error {
	var resp apiResponse[any]
	return c.post(ctx, "/api2/json/cluster/sdn/vnets", params, &resp)
}

// UpdateVNet updates an existing SDN virtual network.
func (c *Client) UpdateVNet(ctx context.Context, vnet string, params map[string]string) error {
	path := fmt.Sprintf("/api2/json/cluster/sdn/vnets/%s", vnet)
	return c.put(ctx, path, params, nil)
}

// DeleteVNet deletes an SDN virtual network.
func (c *Client) DeleteVNet(ctx context.Context, vnet string) error {
	path := fmt.Sprintf("/api2/json/cluster/sdn/vnets/%s", vnet)
	var resp apiResponse[any]
	return c.delete(ctx, path, &resp)
}

// ApplySDN applies pending SDN configuration changes.
func (c *Client) ApplySDN(ctx context.Context) error {
	return c.put(ctx, "/api2/json/cluster/sdn", nil, nil)
}

// CreateVNCProxy requests a VNC proxy session from Proxmox for a given VM.
func (c *Client) CreateVNCProxy(ctx context.Context, node string, vmid int) (*VNCProxyResponse, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
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

// TaskStatus represents the current state of a Proxmox background task.
type TaskStatus struct {
	Status     string `json:"status"`     // "running" or "stopped"
	ExitStatus string `json:"exitstatus"` // "OK" on success, otherwise an error message
}

// GetTaskStatus fetches the current status of a Proxmox task identified by its UPID.
func (c *Client) GetTaskStatus(ctx context.Context, node, upid string) (*TaskStatus, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("/api2/json/nodes/%s/tasks/%s/status", node, upid)
	var resp apiResponse[TaskStatus]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching task status: %w", err)
	}
	return &resp.Data, nil
}

// waitForTask polls a Proxmox task once per second until it stops, the
// context is cancelled, or the task fails. It returns nil only when the
// task finishes with exitstatus == "OK".
func (c *Client) waitForTask(ctx context.Context, node, upid string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		status, err := c.GetTaskStatus(ctx, node, upid)
		if err != nil {
			return err
		}
		if status.Status == "stopped" {
			if status.ExitStatus != "OK" {
				return fmt.Errorf("proxmox task failed: %s", status.ExitStatus)
			}
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
