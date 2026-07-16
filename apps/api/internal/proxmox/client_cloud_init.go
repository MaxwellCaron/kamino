package proxmox

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/routerconfig"
)

func (c *Client) GetLXCNetworks(ctx context.Context, node string, vmid int) ([]VMHardwareNetwork, error) {
	data, err := c.GetVMConfig(ctx, GuestLXC, node, vmid)
	if err != nil {
		return nil, err
	}
	return parseLXCNetworks(data)
}

// GetVMHardwareConfig returns editable VM hardware settings from Proxmox.
func (c *Client) GetVMHardwareConfig(ctx context.Context, node string, vmid int) (*VMHardwareConfig, error) {
	data, err := c.GetVMConfig(ctx, GuestQEMU, node, vmid)
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
		data, err := c.GetVMConfig(waitCtx, GuestQEMU, node, vmid)
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

func (c *Client) VMStorageReady(ctx context.Context, node string, vmid int) (bool, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return false, err
	}

	data, err := c.GetVMConfig(ctx, GuestQEMU, node, vmid)
	if err != nil {
		return false, fmt.Errorf("fetching VM %d config on node %s: %w", vmid, node, err)
	}

	_, storage, _, err := parseVMHardwareDiskConfig(data)
	if err != nil {
		return false, fmt.Errorf("parsing VM %d disk config on node %s: %w", vmid, node, err)
	}

	content, err := c.GetStorageContentByVMID(ctx, node, storage, vmid)
	if err != nil {
		return false, fmt.Errorf("fetching VM %d storage content on node %s storage %s: %w", vmid, node, storage, err)
	}

	for _, item := range content {
		if item.Size > 0 {
			return true, nil
		}
	}
	return false, nil
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
		ready, err := c.VMStorageReady(waitCtx, node, vmid)
		if err != nil {
			return err
		}
		if ready {
			return nil
		}

		select {
		case <-waitCtx.Done():
			return fmt.Errorf("waiting for VM storage readiness: %w", waitCtx.Err())
		case <-ticker.C:
		}
	}
}

// EnsureVMCloudInitDrive verifies the VM has a cloud-init disk configured.
func (c *Client) EnsureVMCloudInitDrive(ctx context.Context, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	data, err := c.GetVMConfig(ctx, GuestQEMU, node, vmid)
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

// SetVMCloudInitCustom points a VM's NoCloud config at pre-created Proxmox
// snippets. Meta-data is omitted so Proxmox generates the instance ID.
func (c *Client) SetVMCloudInitCustom(
	ctx context.Context,
	node string,
	vmid int,
	storage string,
	userFile string,
	networkFile string,
) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	storage = strings.TrimSpace(storage)
	if storage == "" {
		return fmt.Errorf("storage is required")
	}
	if err := routerconfig.ValidateCloudInitSnippetFilename(userFile); err != nil {
		return fmt.Errorf("invalid user cloud-init snippet filename: %w", err)
	}
	if err := routerconfig.ValidateCloudInitSnippetFilename(networkFile); err != nil {
		return fmt.Errorf("invalid network cloud-init snippet filename: %w", err)
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	cicustom := fmt.Sprintf(
		"user=%s:snippets/%s,network=%s:snippets/%s",
		storage,
		userFile,
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
	return c.SetVMNetworkAttachment(ctx, node, vmid, device, NetworkAttachment{
		Bridge:   bridge,
		Firewall: true,
	})
}

// DeleteVMNetworkDevice removes one network interface from a QEMU VM.
func (c *Client) DeleteVMNetworkDevice(ctx context.Context, node string, vmid int, device string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	device = strings.TrimSpace(device)
	if !strings.HasPrefix(device, "net") {
		return fmt.Errorf("invalid network device %q", device)
	}
	index, err := strconv.Atoi(strings.TrimPrefix(device, "net"))
	if err != nil || index < 0 || index > 31 || device != fmt.Sprintf("net%d", index) {
		return fmt.Errorf("invalid network device %q", device)
	}

	path := guestPath(GuestQEMU, node, vmid, "/config")
	if err := c.put(ctx, path, map[string]string{"delete": device}, nil); err != nil {
		return fmt.Errorf("deleting VM network device: %w", err)
	}

	return nil
}

// NetworkAttachment describes the desired Proxmox NIC state.
type NetworkAttachment struct {
	Bridge   string
	VLANTag  *int
	LinkDown bool
	Firewall bool
}

func (c *Client) SetVMNetworkAttachment(
	ctx context.Context,
	node string,
	vmid int,
	device string,
	attachment NetworkAttachment,
) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	device = strings.TrimSpace(device)
	if device == "" {
		return fmt.Errorf("network device is required")
	}
	bridge := strings.TrimSpace(attachment.Bridge)
	if bridge == "" {
		return fmt.Errorf("bridge is required")
	}
	if attachment.VLANTag != nil {
		if *attachment.VLANTag < 1 || *attachment.VLANTag > 4094 {
			return fmt.Errorf("vlan tag must be within 1..4094")
		}
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
	updated.Firewall = attachment.Firewall
	updated.LinkDown = attachment.LinkDown
	updated.VLANTag = attachment.VLANTag

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	if err := c.put(ctx, path, map[string]string{
		device: formatVMHardwareNetwork(updated),
	}, nil); err != nil {
		return fmt.Errorf("updating VM network attachment: %w", err)
	}

	return nil
}
