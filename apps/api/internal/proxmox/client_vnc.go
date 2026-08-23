package proxmox

import (
	"context"
	"fmt"
)

func (c *Client) CreateVNCProxy(ctx context.Context, gt GuestType, node string, vmid int) (*VNCProxyResponse, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}
	path := guestPath(gt, node, vmid, "/vncproxy")
	form := map[string]string{"websocket": "1"}
	if gt == GuestQEMU {
		form["generate-password"] = "1"
	}
	var resp apiResponse[VNCProxyResponse]
	if err := c.post(ctx, path, form, &resp); err != nil {
		return nil, fmt.Errorf("creating VNC proxy: %w", err)
	}
	if gt == GuestLXC && resp.Data.Password == "" {
		resp.Data.Password = resp.Data.Ticket
	}
	return &resp.Data, nil
}
