package proxmox

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

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

// GetVMRuntimeStatus returns the node-local runtime status for a guest.
func (c *Client) GetVMRuntimeStatus(ctx context.Context, gt GuestType, node string, vmid int) (string, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return "", err
	}

	path := guestPath(gt, node, vmid, "/status/current")
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

// WaitForVMRuntimeStatus polls the node-local runtime status until it matches.
func (c *Client) WaitForVMRuntimeStatus(ctx context.Context, gt GuestType, node string, vmid int, expected string, timeout time.Duration) error {
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
		status, err := c.GetVMRuntimeStatus(waitCtx, gt, node, vmid)
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

// GetVMConfig returns the raw Proxmox config for a guest.
func (c *Client) GetVMConfig(ctx context.Context, gt GuestType, node string, vmid int) (map[string]any, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}

	path := guestPath(gt, node, vmid, "/config")
	var resp apiResponse[map[string]any]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching VM config: %w", err)
	}

	return resp.Data, nil
}

// GetVMIdentity returns the stable identity metadata for a guest.
func (c *Client) GetVMIdentity(ctx context.Context, gt GuestType, node string, vmid int) (*VMIdentity, error) {
	data, err := c.GetVMConfig(ctx, gt, node, vmid)
	if err != nil {
		return nil, err
	}

	if gt == GuestLXC {
		summary, err := parseLXCConfigSummary(data, vmid)
		if err != nil {
			return nil, err
		}
		return &VMIdentity{
			Name:         summary.Name,
			IsTemplate:   summary.IsTemplate,
			UpstreamUUID: summary.UpstreamUUID,
		}, nil
	}

	identity, err := parseVMIdentity(data, vmid)
	if err != nil {
		return nil, err
	}

	return identity, nil
}

// GetVMConfigSummary returns inventory metadata derived from a guest config.
func (c *Client) GetVMConfigSummary(ctx context.Context, gt GuestType, node string, vmid int) (*VMConfigSummary, error) {
	data, err := c.GetVMConfig(ctx, gt, node, vmid)
	if err != nil {
		return nil, err
	}

	if gt == GuestLXC {
		return parseLXCConfigSummary(data, vmid)
	}

	return parseVMConfigSummary(data, vmid)
}

// EnsureVMUpstreamUUID returns the guest UUID, assigning SMBIOS UUID for qemu when missing.
func (c *Client) EnsureVMUpstreamUUID(ctx context.Context, gt GuestType, node string, vmid int) (uuid.UUID, error) {
	if gt == GuestLXC {
		return lxcUpstreamUUID(vmid), nil
	}

	data, err := c.GetVMConfig(ctx, gt, node, vmid)
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
	data, err := c.GetVMConfig(ctx, GuestQEMU, node, vmid)
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
