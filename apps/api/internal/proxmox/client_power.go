package proxmox

import (
	"context"
	"fmt"
)

func (c *Client) StartVM(ctx context.Context, gt GuestType, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/status/start")
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("starting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// ShutdownVM sends a graceful shutdown signal to a guest and waits for the task to complete.
func (c *Client) ShutdownVM(ctx context.Context, gt GuestType, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/status/shutdown")
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("shutting down VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// RebootVM sends a reboot signal to a guest and waits for the task to complete.
func (c *Client) RebootVM(ctx context.Context, gt GuestType, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/status/reboot")
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rebooting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// StopVM immediately stops a guest and waits for the task to complete.
func (c *Client) StopVM(ctx context.Context, gt GuestType, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/status/stop")
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("stopping VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteVM deletes a guest and waits for the task to complete.
func (c *Client) DeleteVM(ctx context.Context, gt GuestType, node string, vmid int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "")
	var resp apiResponse[string]
	if err := c.delete(ctx, path, &resp); err != nil {
		return fmt.Errorf("deleting VM: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteVMStopped checks if a guest is running, stops it if so, and then deletes it.
func (c *Client) DeleteVMStopped(ctx context.Context, gt GuestType, node string, vmid int) error {
	status, err := c.GetVMRuntimeStatus(ctx, gt, node, vmid)
	if err != nil {
		return err
	}
	if status == "running" {
		if err := c.StopVM(ctx, gt, node, vmid); err != nil {
			return err
		}
	}
	return c.DeleteVM(ctx, gt, node, vmid)
}

// RenameVM changes the name of a guest.
func (c *Client) RenameVM(ctx context.Context, gt GuestType, node string, vmid int, name string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/config")
	if gt == GuestLXC {
		return c.put(ctx, path, map[string]string{"hostname": name}, nil)
	}
	return c.put(ctx, path, map[string]string{"name": name}, nil)
}

// UpdateVMNotes updates the guest description field used by Proxmox for notes.
func (c *Client) UpdateVMNotes(ctx context.Context, gt GuestType, node string, vmid int, notes string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/config")
	form := map[string]string{}
	if notes == "" {
		form["delete"] = "description"
	} else {
		form["description"] = notes
	}
	return c.put(ctx, path, form, nil)
}
