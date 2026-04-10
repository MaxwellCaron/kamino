package proxmox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
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
	form := url.Values{}
	for k, v := range formData {
		form.Set(k, v)
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

// CreateSnapshot creates a snapshot of a VM and waits for the task to complete.
func (c *Client) CreateSnapshot(ctx context.Context, node string, vmid int, snapname, description string, vmstate bool) error {
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
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, path)
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
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, path)
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
	return c.put(ctx, fmt.Sprintf("/api2/json/pools/%s", poolID), map[string]string{
		"comment": comment,
	}, &resp)
}

// DeletePool removes an empty pool that is no longer represented by Kamino inventory.
func (c *Client) DeletePool(ctx context.Context, poolID string) error {
	var resp apiResponse[any]
	return c.delete(ctx, fmt.Sprintf("/api2/json/pools/%s", poolID), &resp)
}

// AddVMToPool adds a VM to a resource pool.
func (c *Client) AddVMToPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, fmt.Sprintf("/api2/json/pools/%s", poolID), map[string]string{
		"vms": fmt.Sprintf("%d", vmid),
	}, &resp)
}

// RemoveVMFromPool removes a VM from a resource pool.
func (c *Client) RemoveVMFromPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, fmt.Sprintf("/api2/json/pools/%s", poolID), map[string]string{
		"vms":    fmt.Sprintf("%d", vmid),
		"delete": "1",
	}, &resp)
}

// StartVM powers on a VM and waits for the Proxmox task to complete.
func (c *Client) StartVM(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/start", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("starting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// ShutdownVM sends a graceful shutdown signal to a VM and waits for the task to complete.
func (c *Client) ShutdownVM(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/shutdown", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("shutting down VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// RebootVM sends a reboot signal to a VM and waits for the task to complete.
func (c *Client) RebootVM(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/reboot", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rebooting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// StopVM immediately stops a VM and waits for the task to complete.
func (c *Client) StopVM(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/status/stop", node, vmid)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("stopping VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteVM deletes a VM and waits for the task to complete.
func (c *Client) DeleteVM(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d", node, vmid)
	var resp apiResponse[string]
	if err := c.delete(ctx, path, &resp); err != nil {
		return fmt.Errorf("deleting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// RenameVM changes the name of a VM.
func (c *Client) RenameVM(ctx context.Context, node string, vmid int, name string) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	return c.put(ctx, path, map[string]string{"name": name}, nil)
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
		form["target"] = target
		taskNode = target
	}
	var resp apiResponse[string]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return fmt.Errorf("cloning VM: %w", err)
	}
	return c.waitForTask(ctx, taskNode, resp.Data)
}

// ConvertToTemplate converts a VM to a template.
func (c *Client) ConvertToTemplate(ctx context.Context, node string, vmid int) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/template", node, vmid)
	var resp apiResponse[any]
	return c.post(ctx, path, nil, &resp)
}

// GetSnapshots returns all snapshots for a VM.
func (c *Client) GetSnapshots(ctx context.Context, node string, vmid int) ([]Snapshot, error) {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot", node, vmid)
	var resp apiResponse[[]Snapshot]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching snapshots: %w", err)
	}
	return resp.Data, nil
}

// RollbackSnapshot rolls back a VM to a snapshot and waits for the task to complete.
func (c *Client) RollbackSnapshot(ctx context.Context, node string, vmid int, snapname string) error {
	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/snapshot/%s/rollback", node, vmid, snapname)
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rolling back snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteSnapshot deletes a snapshot and waits for the task to complete.
func (c *Client) DeleteSnapshot(ctx context.Context, node string, vmid int, snapname string) error {
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
	return resp.Data, nil
}

func containsContent(content, item string) bool {
	for _, entry := range strings.Split(content, ",") {
		if strings.TrimSpace(entry) == item {
			return true
		}
	}
	return false
}

// ResolveCreateOptionsNode returns the configured metadata node or the first
// node alphabetically when no preference is set.
func (c *Client) ResolveCreateOptionsNode(
	ctx context.Context,
	preferred string,
) (Node, error) {
	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return Node{}, fmt.Errorf("fetching nodes: %w", err)
	}
	if len(nodes) == 0 {
		return Node{}, fmt.Errorf("no cluster nodes available")
	}

	slices.SortFunc(nodes, func(left, right Node) int {
		return strings.Compare(left.Node, right.Node)
	})

	preferred = strings.TrimSpace(preferred)
	if preferred == "" {
		return nodes[0], nil
	}

	for _, node := range nodes {
		if node.Node == preferred {
			return node, nil
		}
	}

	return Node{}, fmt.Errorf("configured create options node %q was not found", preferred)
}

func sortStorages(storages []Storage) {
	slices.SortFunc(storages, func(left, right Storage) int {
		return strings.Compare(left.Storage, right.Storage)
	})
}

// GetStorages returns all storages for a node.
func (c *Client) GetStorages(ctx context.Context, node string) ([]Storage, error) {
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

// CreateVM creates a new virtual machine and waits for the task to complete.
func (c *Client) CreateVM(ctx context.Context, node string, params map[string]string) error {
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
