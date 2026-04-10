package proxmox

import (
	"context"
	"fmt"
	"slices"
)

func ManagedPoolComment(path []string) string {
	if len(path) == 0 {
		return kaminoManagedPoolCommentTag
	}

	return kaminoManagedPoolCommentTag + ": " + joinPath(path)
}

func joinPath(path []string) string {
	if len(path) == 0 {
		return ""
	}

	result := path[0]
	for _, segment := range path[1:] {
		result += "/" + segment
	}
	return result
}

func (c *Client) EnsurePool(ctx context.Context, poolID string, path []string) error {
	if poolID == "" {
		return nil
	}

	pools, err := c.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("fetching pools: %w", err)
	}

	expectedComment := ManagedPoolComment(path)
	index := slices.IndexFunc(pools, func(pool Pool) bool {
		return pool.PoolID == poolID
	})

	if index == -1 {
		if err := c.CreatePool(ctx, poolID, expectedComment); err != nil {
			return fmt.Errorf("creating pool %q: %w", poolID, err)
		}
		return nil
	}

	if pools[index].Comment == expectedComment {
		return nil
	}

	if err := c.UpdatePoolComment(ctx, poolID, expectedComment); err != nil {
		return fmt.Errorf("updating pool %q: %w", poolID, err)
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
