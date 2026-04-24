package proxmox

import (
	"context"
	"fmt"
	"slices"
)

func availableMemory(node Node) int64 {
	available := node.MaxMem - node.Mem
	if available < 0 {
		return 0
	}
	return available
}

func availableCPU(node Node) float64 {
	available := float64(node.MaxCPU) * (1 - node.CPU)
	if available < 0 {
		return 0
	}
	return available
}

func compareNodeCapacity(left, right Node) int {
	if availableMemory(left) != availableMemory(right) {
		if availableMemory(right) > availableMemory(left) {
			return 1
		}
		return -1
	}

	if availableCPU(left) != availableCPU(right) {
		if availableCPU(right) > availableCPU(left) {
			return 1
		}
		return -1
	}

	switch {
	case left.Node < right.Node:
		return -1
	case left.Node > right.Node:
		return 1
	default:
		return 0
	}
}

func (c *Client) GetOptimalNode(ctx context.Context) (Node, error) {
	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return Node{}, err
	}
	if len(nodes) == 0 {
		return Node{}, fmt.Errorf("no cluster nodes available")
	}

	slices.SortFunc(nodes, compareNodeCapacity)
	return nodes[0], nil
}
