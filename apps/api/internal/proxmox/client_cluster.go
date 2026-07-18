package proxmox

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/sync/errgroup"
)

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
	var (
		bridges    []NetworkBridge
		bridgesErr error
		vnets      []VNet
		vnetsErr   error
	)

	group := new(errgroup.Group)
	group.Go(func() error {
		bridges, bridgesErr = c.GetBridges(ctx, node)
		return nil
	})
	group.Go(func() error {
		vnets, vnetsErr = c.GetVNets(ctx)
		return nil
	})
	_ = group.Wait()

	if bridgesErr != nil {
		return nil, nil, fmt.Errorf("fetching bridges for %s: %w", node, bridgesErr)
	}
	slices.SortFunc(bridges, func(left, right NetworkBridge) int {
		return strings.Compare(left.Iface, right.Iface)
	})

	if vnetsErr != nil {
		return nil, nil, fmt.Errorf("fetching vnets: %w", vnetsErr)
	}
	slices.SortFunc(vnets, func(left, right VNet) int {
		return strings.Compare(left.VNet, right.VNet)
	})

	return bridges, vnets, nil
}

// UsedVMIDs returns all VMIDs in the cluster without filtering to configured nodes.
func (c *Client) UsedVMIDs(ctx context.Context) (map[int]struct{}, error) {
	var resp apiResponse[[]VM]
	if err := c.get(ctx, "/api2/json/cluster/resources?type=vm", &resp); err != nil {
		return nil, fmt.Errorf("fetching cluster VMIDs: %w", err)
	}
	used := make(map[int]struct{}, len(resp.Data))
	for _, vm := range resp.Data {
		used[vm.VMID] = struct{}{}
	}
	return used, nil
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

// clusterNextIDErrors is the error map returned by Proxmox when a VMID is already in use.
type clusterNextIDErrors struct {
	Errors map[string]string `json:"errors"`
}

// IsVMIDAvailable returns true when the Proxmox cluster asserts the VMID is free.
func (c *Client) IsVMIDAvailable(ctx context.Context, vmid int) (bool, error) {
	path := fmt.Sprintf("/api2/json/cluster/nextid?vmid=%d", vmid)
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

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return false, fmt.Errorf("reading VMID availability response: %w", err)
	}

	if resp.StatusCode == http.StatusOK {
		var envelope apiResponse[json.Number]
		if err := json.Unmarshal(body, &envelope); err != nil {
			return false, fmt.Errorf("decoding VMID availability response: %w", err)
		}
		id, err := envelope.Data.Int64()
		if err != nil || int(id) != vmid {
			return false, fmt.Errorf("unexpected VMID in cluster assertion response: got %s, want %d", envelope.Data, vmid)
		}
		return true, nil
	}

	if resp.StatusCode == http.StatusBadRequest {
		var errResp clusterNextIDErrors
		if err := json.Unmarshal(body, &errResp); err == nil {
			if msg, ok := errResp.Errors["vmid"]; ok && strings.Contains(strings.ToLower(msg), "already exists") {
				return false, nil
			}
		}
	}

	return false, unexpectedStatusErrorWithBody(resp.StatusCode, path, string(body))
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
