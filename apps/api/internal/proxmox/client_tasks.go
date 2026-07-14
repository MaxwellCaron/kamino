package proxmox

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Task is a handle to a started Proxmox background task.
type Task struct {
	Node string
	UPID string
}

type TaskStatus struct {
	Status     string `json:"status"`     // "running" or "stopped"
	ExitStatus string `json:"exitstatus"` // OK, WARNINGS: <count>, or error
}

func isTaskWarningStatus(exitStatus string) bool {
	return strings.HasPrefix(exitStatus, "WARNINGS: ")
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

// waitForTask polls until the task stops; nil means OK or WARNINGS: <count>.
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
			if status.ExitStatus != "OK" && !isTaskWarningStatus(status.ExitStatus) {
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
