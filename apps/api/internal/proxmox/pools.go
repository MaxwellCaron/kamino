package proxmox

import (
	"context"
	"fmt"
	"slices"
)

func (c *Client) EnsurePool(ctx context.Context, poolID string, path []string) error {
	if poolID == "" {
		return nil
	}
	if len(path) == 0 {
		path = decodePoolPath(poolID)
	}

	pools, err := c.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("fetching pools: %w", err)
	}

	for i := range path {
		currentPath := path[:i+1]
		currentPoolID := EncodePoolPath(currentPath)
		if slices.ContainsFunc(pools, func(pool Pool) bool {
			return pool.PoolID == currentPoolID
		}) {
			continue
		}

		if createErr := c.CreatePool(ctx, currentPoolID, nil); createErr != nil {
			// Another workflow may have created the pool after the initial list.
			refreshedPools, refreshErr := c.GetPools(ctx)
			if refreshErr != nil {
				return fmt.Errorf(
					"creating pool %q: %w (verifying pool existence: %v)",
					currentPoolID,
					createErr,
					refreshErr,
				)
			}
			if !slices.ContainsFunc(refreshedPools, func(pool Pool) bool {
				return pool.PoolID == currentPoolID
			}) {
				return fmt.Errorf("creating pool %q: %w", currentPoolID, createErr)
			}
			pools = refreshedPools
			continue
		}

		pools = append(pools, Pool{PoolID: currentPoolID})
	}

	return nil
}

func (c *Client) SyncVMPoolMembership(
	ctx context.Context,
	node string,
	vmid int,
	desiredPool string,
	path []string,
) error {
	if desiredPool != "" {
		if err := c.EnsurePool(ctx, desiredPool, path); err != nil {
			return err
		}
	}

	currentPool := ""
	vms, err := c.GetVMs(ctx)
	if err != nil {
		return fmt.Errorf("fetching VMs: %w", err)
	}

	for _, vm := range vms {
		if vm.Node == node && vm.VMID == vmid {
			currentPool = vm.Pool
			break
		}
	}

	if currentPool == desiredPool {
		return nil
	}

	if currentPool != "" {
		if err := c.RemoveVMFromPool(ctx, currentPool, vmid); err != nil {
			return fmt.Errorf("removing VM %d from pool %q: %w", vmid, currentPool, err)
		}
	}

	if desiredPool == "" {
		return nil
	}

	if err := c.AddVMToPool(ctx, desiredPool, vmid); err != nil {
		return fmt.Errorf("adding VM %d to pool %q: %w", vmid, desiredPool, err)
	}

	return nil
}
