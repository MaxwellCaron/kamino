package proxmox

import (
	"context"
	"fmt"
	"net/url"
)

func (c *Client) CreatePool(ctx context.Context, poolID string, comment *string) error {
	payload := map[string]string{
		"poolid": poolID,
	}
	if comment != nil {
		payload["comment"] = *comment
	}

	var resp apiResponse[any]
	return c.post(ctx, "/api2/json/pools", payload, &resp)
}

// UpdatePoolComment updates the comment on an existing Proxmox pool.
func (c *Client) UpdatePoolComment(ctx context.Context, poolID string, comment *string) error {
	payload := map[string]string{
		"poolid": poolID,
	}
	if comment != nil {
		payload["comment"] = *comment
	} else {
		payload["comment"] = ""
	}

	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", payload, &resp)
}

// DeletePool removes an empty pool that is no longer represented by Kamino inventory.
func (c *Client) DeletePool(ctx context.Context, poolID string) error {
	var resp apiResponse[any]
	return c.delete(ctx, poolEndpoint(poolID), &resp)
}

// AddVMToPool adds a VM to a resource pool.
func (c *Client) AddVMToPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", map[string]string{
		"poolid": poolID,
		"vms":    fmt.Sprintf("%d", vmid),
	}, &resp)
}

// RemoveVMFromPool removes a VM from a resource pool.
func (c *Client) RemoveVMFromPool(ctx context.Context, poolID string, vmid int) error {
	var resp apiResponse[any]
	return c.put(ctx, "/api2/json/pools/", map[string]string{
		"poolid": poolID,
		"vms":    fmt.Sprintf("%d", vmid),
		"delete": "1",
	}, &resp)
}

func poolEndpoint(poolID string) string {
	query := url.Values{}
	query.Set("poolid", poolID)
	return "/api2/json/pools/?" + query.Encode()
}
