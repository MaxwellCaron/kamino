package proxmox

import (
	"context"
	"fmt"
	"time"
)

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
