package proxmox

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"sync"

	"golang.org/x/sync/errgroup"
)

type ClusterUsageTimeframe string

const (
	ClusterUsageTimeframeHour  ClusterUsageTimeframe = "hour"
	ClusterUsageTimeframeDay   ClusterUsageTimeframe = "day"
	ClusterUsageTimeframeWeek  ClusterUsageTimeframe = "week"
	ClusterUsageTimeframeMonth ClusterUsageTimeframe = "month"
)

type rrdDataPoint struct {
	Time    int64    `json:"time"`
	CPU     *float64 `json:"cpu,omitempty"`
	MaxCPU  *float64 `json:"maxcpu,omitempty"`
	Mem     *float64 `json:"mem,omitempty"`
	MemUsed *float64 `json:"memused,omitempty"`
	MaxMem  *float64 `json:"maxmem,omitempty"`
	Used    *float64 `json:"used,omitempty"`
	Total   *float64 `json:"total,omitempty"`
}

type UsageHistoryPoint struct {
	Time           int64   `json:"time"`
	CPUUsed        float64 `json:"cpu_used"`
	CPUTotal       float64 `json:"cpu_total"`
	CPUPercent     float64 `json:"cpu_percent"`
	MemoryUsed     float64 `json:"memory_used"`
	MemoryTotal    float64 `json:"memory_total"`
	MemoryPercent  float64 `json:"memory_percent"`
	StorageUsed    float64 `json:"storage_used"`
	StorageTotal   float64 `json:"storage_total"`
	StoragePercent float64 `json:"storage_percent"`
}

type NodeUsageHistory struct {
	Node   string              `json:"node"`
	Points []UsageHistoryPoint `json:"points"`
}

type ClusterUsageHistory struct {
	Points []UsageHistoryPoint `json:"points"`
	Nodes  []NodeUsageHistory  `json:"nodes"`
}

type usageBucket struct {
	cpuUsed      float64
	cpuTotal     float64
	memoryUsed   float64
	memoryTotal  float64
	storageUsed  float64
	storageTotal float64
}

type nodeHistoryResult struct {
	node          Node
	usagePoints   []rrdDataPoint
	storagePoints map[string][]rrdDataPoint
}

func percent(used, total float64) float64 {
	if total <= 0 || math.IsNaN(used) || math.IsNaN(total) {
		return 0
	}
	value := (used / total) * 100
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Min(100, math.Max(0, value))
}

func derefFloat(value *float64, fallback float64) float64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
		return fallback
	}
	return *value
}

func nodeMemoryUsed(point rrdDataPoint) float64 {
	if point.MemUsed != nil {
		return derefFloat(point.MemUsed, 0)
	}
	return derefFloat(point.Mem, 0)
}

func normalizeClusterUsageTimeframe(value string) ClusterUsageTimeframe {
	switch ClusterUsageTimeframe(value) {
	case ClusterUsageTimeframeHour:
		return ClusterUsageTimeframeHour
	case ClusterUsageTimeframeWeek:
		return ClusterUsageTimeframeWeek
	case ClusterUsageTimeframeMonth:
		return ClusterUsageTimeframeMonth
	default:
		return ClusterUsageTimeframeDay
	}
}

func buildUsageHistoryPoints(results []nodeHistoryResult) []UsageHistoryPoint {
	buckets := make(map[int64]*usageBucket)
	for _, result := range results {
		defaultCPUTotal := float64(result.node.MaxCPU)
		defaultMemoryTotal := float64(result.node.MaxMem)

		for _, point := range result.usagePoints {
			if point.Time <= 0 {
				continue
			}

			bucket := buckets[point.Time]
			if bucket == nil {
				bucket = &usageBucket{}
				buckets[point.Time] = bucket
			}

			cpuTotal := derefFloat(point.MaxCPU, defaultCPUTotal)
			cpuUsed := derefFloat(point.CPU, 0) * cpuTotal
			memoryTotal := derefFloat(point.MaxMem, defaultMemoryTotal)
			memoryUsed := nodeMemoryUsed(point)

			bucket.cpuTotal += cpuTotal
			bucket.cpuUsed += cpuUsed
			bucket.memoryTotal += memoryTotal
			bucket.memoryUsed += memoryUsed
		}

		for _, storageHistory := range result.storagePoints {
			for _, point := range storageHistory {
				if point.Time <= 0 {
					continue
				}

				bucket := buckets[point.Time]
				if bucket == nil {
					bucket = &usageBucket{}
					buckets[point.Time] = bucket
				}

				bucket.storageTotal += derefFloat(point.Total, 0)
				bucket.storageUsed += derefFloat(point.Used, 0)
			}
		}
	}

	times := make([]int64, 0, len(buckets))
	for timestamp := range buckets {
		times = append(times, timestamp)
	}
	sort.Slice(times, func(left, right int) bool {
		return times[left] < times[right]
	})

	points := make([]UsageHistoryPoint, 0, len(times))
	for _, timestamp := range times {
		bucket := buckets[timestamp]
		points = append(points, UsageHistoryPoint{
			Time:           timestamp,
			CPUUsed:        bucket.cpuUsed,
			CPUTotal:       bucket.cpuTotal,
			CPUPercent:     percent(bucket.cpuUsed, bucket.cpuTotal),
			MemoryUsed:     bucket.memoryUsed,
			MemoryTotal:    bucket.memoryTotal,
			MemoryPercent:  percent(bucket.memoryUsed, bucket.memoryTotal),
			StorageUsed:    bucket.storageUsed,
			StorageTotal:   bucket.storageTotal,
			StoragePercent: percent(bucket.storageUsed, bucket.storageTotal),
		})
	}

	return points
}

func (c *Client) GetNodeRRDData(
	ctx context.Context,
	node string,
	timeframe string,
	consolidationFunc string,
) ([]rrdDataPoint, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}

	path := fmt.Sprintf(
		"/api2/json/nodes/%s/rrddata?timeframe=%s&cf=%s",
		node,
		url.QueryEscape(timeframe),
		url.QueryEscape(consolidationFunc),
	)
	var resp apiResponse[[]rrdDataPoint]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("fetching node rrddata for %s: %w", node, err)
	}
	return resp.Data, nil
}

func (c *Client) GetStorageRRDData(
	ctx context.Context,
	node string,
	storage string,
	timeframe string,
	consolidationFunc string,
) ([]rrdDataPoint, error) {
	if err := c.requireAllowedNode(node); err != nil {
		return nil, err
	}

	path := fmt.Sprintf(
		"/api2/json/nodes/%s/storage/%s/rrddata?timeframe=%s&cf=%s",
		node,
		url.PathEscape(storage),
		url.QueryEscape(timeframe),
		url.QueryEscape(consolidationFunc),
	)
	var resp apiResponse[[]rrdDataPoint]
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf(
			"fetching storage rrddata for %s/%s: %w",
			node,
			storage,
			err,
		)
	}
	return resp.Data, nil
}

func (c *Client) GetClusterUsageHistory(
	ctx context.Context,
	timeframe string,
) (ClusterUsageHistory, error) {
	normalizedTimeframe := string(normalizeClusterUsageTimeframe(timeframe))
	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return ClusterUsageHistory{}, err
	}
	if len(nodes) == 0 {
		return ClusterUsageHistory{
			Points: []UsageHistoryPoint{},
			Nodes:  []NodeUsageHistory{},
		}, nil
	}

	results := make([]nodeHistoryResult, len(nodes))
	group, groupCtx := errgroup.WithContext(ctx)

	for index, node := range nodes {
		index := index
		node := node
		group.Go(func() error {
			usagePoints, err := c.GetNodeRRDData(
				groupCtx,
				node.Node,
				normalizedTimeframe,
				"AVERAGE",
			)
			if err != nil {
				return err
			}

			storages, err := c.GetStorages(groupCtx, node.Node)
			if err != nil {
				return fmt.Errorf("fetching storages for %s: %w", node.Node, err)
			}

			storagePoints := make(map[string][]rrdDataPoint, len(storages))
			storageGroup, storageCtx := errgroup.WithContext(groupCtx)
			var storageMu sync.Mutex

			for _, storage := range storages {
				storage := storage
				storageGroup.Go(func() error {
					points, err := c.GetStorageRRDData(
						storageCtx,
						node.Node,
						storage.Storage,
						normalizedTimeframe,
						"AVERAGE",
					)
					if err != nil {
						return err
					}

					storageMu.Lock()
					storagePoints[storage.Storage] = points
					storageMu.Unlock()
					return nil
				})
			}

			if err := storageGroup.Wait(); err != nil {
				return err
			}

			results[index] = nodeHistoryResult{
				node:          node,
				usagePoints:   usagePoints,
				storagePoints: storagePoints,
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return ClusterUsageHistory{}, err
	}

	nodeHistories := make([]NodeUsageHistory, len(results))
	for index, result := range results {
		nodeHistories[index] = NodeUsageHistory{
			Node:   result.node.Node,
			Points: buildUsageHistoryPoints([]nodeHistoryResult{result}),
		}
	}

	return ClusterUsageHistory{
		Points: buildUsageHistoryPoints(results),
		Nodes:  nodeHistories,
	}, nil
}
