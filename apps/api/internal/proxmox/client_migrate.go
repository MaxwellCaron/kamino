package proxmox

import (
	"context"
	"fmt"
)

// MigrateVM migrates a QEMU guest to another managed node and waits for the
// Proxmox task to complete.
func (c *Client) MigrateVM(
	ctx context.Context,
	gt GuestType,
	node string,
	vmid int,
	target string,
) error {
	if gt != GuestQEMU {
		return fmt.Errorf("migration is not supported for guest type %q", gt)
	}
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if err := c.requireAllowedNode(target); err != nil {
		return err
	}
	if node == target {
		return fmt.Errorf("target node must differ from source node")
	}

	path := guestPath(gt, node, vmid, "/migrate")
	form := map[string]string{
		"target":           target,
		"online":           "1",
		"with-local-disks": "1",
	}
	var resp apiResponse[string]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return fmt.Errorf("migrating VM: %w", err)
	}

	return c.WaitForTask(ctx, node, resp.Data)
}
