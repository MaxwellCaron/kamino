package proxmox

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
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

var sharedStorageTypes = map[string]struct{}{
	"nfs":         {},
	"cifs":        {},
	"cephfs":      {},
	"rbd":         {},
	"iscsi":       {},
	"iscsidirect": {},
	"glusterfs":   {},
}

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

type SharedStorageUsageHistory struct {
	Storage string              `json:"storage"`
	Type    string              `json:"type"`
	Nodes   []string            `json:"nodes"`
	Points  []UsageHistoryPoint `json:"points"`
}

type ClusterUsageHistory struct {
	Points         []UsageHistoryPoint         `json:"points"`
	Nodes          []NodeUsageHistory          `json:"nodes"`
	SharedStorages []SharedStorageUsageHistory `json:"shared_storages"`
}

type usageBucket struct {
	cpuUsed      float64
	cpuTotal     float64
	memoryUsed   float64
	memoryTotal  float64
	storageUsed  float64
	storageTotal float64
}

type storageWithHistory struct {
	storage Storage
	points  []rrdDataPoint
}

type nodeHistoryResult struct {
	node             Node
	usagePoints      []rrdDataPoint
	storageHistories []storageWithHistory
}

func parseSharedStorageNames(names []string) map[string]struct{} {
	result := make(map[string]struct{}, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		result[name] = struct{}{}
	}
	return result
}

func storageGroupKey(storage Storage) string {
	return strings.ToLower(storage.Type) + ":" + storage.Storage
}

func isSharedStorage(storage Storage, overrideNames map[string]struct{}) bool {
	if storage.Shared != nil && *storage.Shared == 1 {
		return true
	}
	if _, ok := overrideNames[storage.Storage]; ok {
		return true
	}
	_, ok := sharedStorageTypes[strings.ToLower(storage.Type)]
	return ok
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

func accumulateNodeMetrics(
	bucket *usageBucket,
	point rrdDataPoint,
	defaultCPUTotal float64,
	defaultMemoryTotal float64,
) {
	cpuTotal := derefFloat(point.MaxCPU, defaultCPUTotal)
	cpuUsed := derefFloat(point.CPU, 0) * cpuTotal
	memoryTotal := derefFloat(point.MaxMem, defaultMemoryTotal)
	memoryUsed := nodeMemoryUsed(point)

	bucket.cpuTotal += cpuTotal
	bucket.cpuUsed += cpuUsed
	bucket.memoryTotal += memoryTotal
	bucket.memoryUsed += memoryUsed
}

func accumulateStorageMetrics(bucket *usageBucket, point rrdDataPoint) {
	bucket.storageTotal += derefFloat(point.Total, 0)
	bucket.storageUsed += derefFloat(point.Used, 0)
}

func bucketsToUsageHistoryPoints(buckets map[int64]*usageBucket) []UsageHistoryPoint {
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

func buildNodeUsageHistoryPoints(
	result nodeHistoryResult,
	sharedStorageNames map[string]struct{},
) []UsageHistoryPoint {
	buckets := make(map[int64]*usageBucket)
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

		accumulateNodeMetrics(bucket, point, defaultCPUTotal, defaultMemoryTotal)
	}

	for _, entry := range result.storageHistories {
		if isSharedStorage(entry.storage, sharedStorageNames) {
			continue
		}

		for _, point := range entry.points {
			if point.Time <= 0 {
				continue
			}

			bucket := buckets[point.Time]
			if bucket == nil {
				bucket = &usageBucket{}
				buckets[point.Time] = bucket
			}

			accumulateStorageMetrics(bucket, point)
		}
	}

	return bucketsToUsageHistoryPoints(buckets)
}

func buildClusterUsageHistoryPoints(
	results []nodeHistoryResult,
	sharedStorageNames map[string]struct{},
) []UsageHistoryPoint {
	buckets := make(map[int64]*usageBucket)
	sharedSeen := make(map[string]struct{})

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

			accumulateNodeMetrics(bucket, point, defaultCPUTotal, defaultMemoryTotal)
		}

		for _, entry := range result.storageHistories {
			if isSharedStorage(entry.storage, sharedStorageNames) {
				key := storageGroupKey(entry.storage)
				if _, seen := sharedSeen[key]; seen {
					continue
				}
				sharedSeen[key] = struct{}{}

				for _, point := range entry.points {
					if point.Time <= 0 {
						continue
					}

					bucket := buckets[point.Time]
					if bucket == nil {
						bucket = &usageBucket{}
						buckets[point.Time] = bucket
					}

					accumulateStorageMetrics(bucket, point)
				}
				continue
			}

			for _, point := range entry.points {
				if point.Time <= 0 {
					continue
				}

				bucket := buckets[point.Time]
				if bucket == nil {
					bucket = &usageBucket{}
					buckets[point.Time] = bucket
				}

				accumulateStorageMetrics(bucket, point)
			}
		}
	}

	return bucketsToUsageHistoryPoints(buckets)
}

func buildStorageOnlyUsageHistoryPoints(points []rrdDataPoint) []UsageHistoryPoint {
	buckets := make(map[int64]*usageBucket)

	for _, point := range points {
		if point.Time <= 0 {
			continue
		}

		bucket := buckets[point.Time]
		if bucket == nil {
			bucket = &usageBucket{}
			buckets[point.Time] = bucket
		}

		accumulateStorageMetrics(bucket, point)
	}

	return bucketsToUsageHistoryPoints(buckets)
}

func buildSharedStorageUsageHistories(
	results []nodeHistoryResult,
	sharedStorageNames map[string]struct{},
) []SharedStorageUsageHistory {
	type sharedAccumulator struct {
		storage Storage
		nodes   []string
		points  []rrdDataPoint
	}

	sharedGroups := make(map[string]*sharedAccumulator)

	for _, result := range results {
		for _, entry := range result.storageHistories {
			if !isSharedStorage(entry.storage, sharedStorageNames) {
				continue
			}

			key := storageGroupKey(entry.storage)
			accumulator := sharedGroups[key]
			if accumulator == nil {
				accumulator = &sharedAccumulator{
					storage: entry.storage,
					points:  entry.points,
				}
				sharedGroups[key] = accumulator
			}

			accumulator.nodes = append(accumulator.nodes, result.node.Node)
		}
	}

	keys := make([]string, 0, len(sharedGroups))
	for key := range sharedGroups {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	histories := make([]SharedStorageUsageHistory, 0, len(keys))
	for _, key := range keys {
		accumulator := sharedGroups[key]
		histories = append(histories, SharedStorageUsageHistory{
			Storage: accumulator.storage.Storage,
			Type:    accumulator.storage.Type,
			Nodes:   accumulator.nodes,
			Points:  buildStorageOnlyUsageHistoryPoints(accumulator.points),
		})
	}

	return histories
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
	sharedStorageNames := c.sharedStorageNames
	if sharedStorageNames == nil {
		sharedStorageNames = map[string]struct{}{}
	}

	nodes, err := c.GetNodes(ctx)
	if err != nil {
		return ClusterUsageHistory{}, err
	}
	if len(nodes) == 0 {
		return ClusterUsageHistory{
			Points:         []UsageHistoryPoint{},
			Nodes:          []NodeUsageHistory{},
			SharedStorages: []SharedStorageUsageHistory{},
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

			storageHistories := make([]storageWithHistory, 0, len(storages))
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
					storageHistories = append(storageHistories, storageWithHistory{
						storage: storage,
						points:  points,
					})
					storageMu.Unlock()
					return nil
				})
			}

			if err := storageGroup.Wait(); err != nil {
				return err
			}

			results[index] = nodeHistoryResult{
				node:             node,
				usagePoints:      usagePoints,
				storageHistories: storageHistories,
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
			Points: buildNodeUsageHistoryPoints(result, sharedStorageNames),
		}
	}

	return ClusterUsageHistory{
		Points:         buildClusterUsageHistoryPoints(results, sharedStorageNames),
		Nodes:          nodeHistories,
		SharedStorages: buildSharedStorageUsageHistories(results, sharedStorageNames),
	}, nil
}
