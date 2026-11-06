package proxmox

import (
	"context"
	"fmt"
)

func (c *Client) GetVNets(ctx context.Context) ([]VNet, error) {
	var resp apiResponse[[]VNet]
	if err := c.get(ctx, "/api2/json/cluster/sdn/vnets", &resp); err != nil {
		return nil, fmt.Errorf("fetching VNets: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) GetSDNZones(ctx context.Context) ([]SDNZone, error) {
	var resp apiResponse[[]SDNZone]
	if err := c.get(ctx, "/api2/json/cluster/sdn/zones", &resp); err != nil {
		return nil, fmt.Errorf("fetching SDN zones: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) CreateVNet(ctx context.Context, params map[string]string) error {
	var resp apiResponse[any]
	return c.post(ctx, "/api2/json/cluster/sdn/vnets", params, &resp)
}

func (c *Client) UpdateVNet(ctx context.Context, vnet string, params map[string]string) error {
	path := fmt.Sprintf("/api2/json/cluster/sdn/vnets/%s", vnet)
	return c.put(ctx, path, params, nil)
}

func (c *Client) DeleteVNet(ctx context.Context, vnet string) error {
	path := fmt.Sprintf("/api2/json/cluster/sdn/vnets/%s", vnet)
	var resp apiResponse[any]
	return c.delete(ctx, path, &resp)
}

func (c *Client) ApplySDN(ctx context.Context) error {
	return c.put(ctx, "/api2/json/cluster/sdn", nil, nil)
}
