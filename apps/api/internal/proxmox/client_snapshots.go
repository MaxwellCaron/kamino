package proxmox

import (
	"context"
	"fmt"
)

type VNCProxyResponse struct {
	Port     string `json:"port"`
	Ticket   string `json:"ticket"`
	Password string `json:"password"`
}

// CreateSnapshot creates a snapshot of a guest and waits for the task to complete.
func (c *Client) CreateSnapshot(ctx context.Context, gt GuestType, node string, vmid int, snapname, description string, vmstate bool) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if gt == GuestLXC && vmstate {
		return ErrLXCRAMSnapshot
	}
	path := guestPath(gt, node, vmid, "/snapshot")
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

func (c *Client) GetSnapshots(ctx context.Context, gt GuestType, node string, vmid int) ([]Snapshot, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := guestPath(gt, node, vmid, "/snapshot")
	var resp apiResponse[[]Snapshot]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching snapshots: %w", err)
	}
	return resp.Data, nil
}

// RollbackSnapshot rolls back a guest to a snapshot and waits for the task to complete.
func (c *Client) RollbackSnapshot(ctx context.Context, gt GuestType, node string, vmid int, snapname string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/snapshot/"+snapname+"/rollback")
	var resp apiResponse[string]
	if err := c.post(ctx, path, nil, &resp); err != nil {
		return fmt.Errorf("rolling back snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}

// DeleteSnapshot deletes a snapshot and waits for the task to complete.
func (c *Client) DeleteSnapshot(ctx context.Context, gt GuestType, node string, vmid int, snapname string) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	path := guestPath(gt, node, vmid, "/snapshot/"+snapname)
	var resp apiResponse[string]
	if err := c.delete(ctx, path, &resp); err != nil {
		return fmt.Errorf("deleting snapshot: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}
