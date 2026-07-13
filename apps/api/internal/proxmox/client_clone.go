package proxmox

import (
	"context"
	"fmt"
)

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
	if target != "" {
		if err := c.requireAllowedNode(target); err != nil {
			return CloneTask{}, err
		}
		form["target"] = target
	}
	var resp apiResponse[string]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return CloneTask{}, fmt.Errorf("cloning VM: %w", err)
	}
	return CloneTask{Node: node, UPID: resp.Data}, nil
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
