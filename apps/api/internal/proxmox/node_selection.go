package proxmox

import (
	"context"
	"fmt"
	"log"
	"slices"
	"strings"
)

const (
	nodeScoreMemoryWeight = 0.5
	nodeScoreCPUWeight    = 0.5
)

const nodeStatusOnline = "online"

func clampFraction(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

// nodeCapacityScore returns combined memory/CPU headroom in [0,1]; higher means less utilized.
func nodeCapacityScore(node Node) float64 {
	if node.MaxMem <= 0 || node.MaxCPU <= 0 {
		return 0
	}
	memoryHeadroom := clampFraction(float64(node.MaxMem-node.Mem) / float64(node.MaxMem))
	cpuHeadroom := clampFraction(1 - node.CPU)
	return nodeScoreMemoryWeight*memoryHeadroom + nodeScoreCPUWeight*cpuHeadroom
}

func pickOptimalNode(nodes []Node) (Node, error) {
	eligible := make([]Node, 0, len(nodes))
	for _, node := range nodes {
		if node.Status == nodeStatusOnline && node.MaxMem > 0 && node.MaxCPU > 0 {
			eligible = append(eligible, node)
		}
	}
	if len(eligible) == 0 {
		return Node{}, fmt.Errorf("no online cluster nodes available")
	}

	slices.SortFunc(eligible, func(left, right Node) int {
		leftScore, rightScore := nodeCapacityScore(left), nodeCapacityScore(right)
		switch {
		case leftScore > rightScore:
			return -1
		case leftScore < rightScore:
			return 1
		default:
			return strings.Compare(left.Node, right.Node)
		}
	})
	return eligible[0], nil
}

func (c *Client) GetOptimalNode(ctx context.Context) (Node, error) {
	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return Node{}, err
	}

	optimal, err := pickOptimalNode(nodes)
	if err != nil {
		return Node{}, err
	}
	for _, node := range nodes {
		log.Printf(
			"proxmox optimal node: %s status=%s score=%.3f mem=%d/%d cpu=%.2f/%d",
			node.Node, node.Status, nodeCapacityScore(node), node.Mem, node.MaxMem,
			node.CPU, node.MaxCPU,
		)
	}
	log.Printf("proxmox optimal node: selected %s", optimal.Node)
	return optimal, nil
}
