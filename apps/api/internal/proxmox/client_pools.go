package proxmox

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

var ErrPoolLeafMustStartWithLetter = errors.New("pool leaf name must start with a letter")

// poolLeafStartsWithLetter reports whether the final path segment of a
// (possibly nested) pool ID starts with an ASCII letter — the only IDs
// PVE9 allows POST /pools to create. Existing PVE8-era IDs bypass this.
func poolLeafStartsWithLetter(poolID string) bool {
	leaf := poolID
	if i := strings.LastIndex(poolID, "/"); i >= 0 {
		leaf = poolID[i+1:]
	}
	if leaf == "" {
		return false
	}
	first := leaf[0]
	return (first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z')
}

func (c *Client) CreatePool(ctx context.Context, poolID string, comment *string) error {
	if !poolLeafStartsWithLetter(poolID) {
		return fmt.Errorf("pool %q: %w", poolID, ErrPoolLeafMustStartWithLetter)
	}

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

// DeletePools deletes the supplied, already-ordered pool IDs, stopping at the first failure; missing targets are skipped.
func (c *Client) DeletePools(ctx context.Context, poolIDs []string) error {
	if len(poolIDs) == 0 {
		return nil
	}

	current, err := c.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("listing pools: %w", err)
	}

	existing := make(map[string]struct{}, len(current))
	for _, pool := range current {
		existing[pool.PoolID] = struct{}{}
	}

	for _, poolID := range poolIDs {
		if _, ok := existing[poolID]; !ok {
			continue
		}
		if err := c.DeletePool(ctx, poolID); err != nil {
			return fmt.Errorf("deleting pool %q: %w", poolID, err)
		}
	}

	return nil
}

// CreatePoolWithComment ensures every ancestor pool exists parent-first, then sets the comment on the leaf.
func (c *Client) CreatePoolWithComment(ctx context.Context, poolID string, comment string) error {
	if err := c.EnsurePool(ctx, poolID, nil); err != nil {
		return fmt.Errorf("ensuring pool: %w", err)
	}
	if comment == "" {
		return nil
	}
	if err := c.UpdatePoolComment(ctx, poolID, &comment); err != nil {
		return fmt.Errorf("setting pool comment: %w", err)
	}
	return nil
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
