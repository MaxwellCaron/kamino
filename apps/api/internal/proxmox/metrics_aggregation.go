package proxmox

import (
	"sort"
)

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

func selectSharedStorageHistories(
	results []nodeHistoryResult,
	configuredNodeOrder []string,
	sharedStorageNames map[string]struct{},
) map[string]sharedStorageSelection {
	exposures := make(map[string]map[string]storageWithHistory)

	for _, result := range results {
		for _, entry := range result.storageHistories {
			if !isSharedStorage(entry.storage, sharedStorageNames) {
				continue
			}

			key := storageGroupKey(entry.storage)
			if exposures[key] == nil {
				exposures[key] = make(map[string]storageWithHistory)
			}
			exposures[key][result.node.Node] = entry
		}
	}

	selections := make(map[string]sharedStorageSelection, len(exposures))
	for key, byNode := range exposures {
		var storage Storage
		for _, entry := range byNode {
			storage = entry.storage
			break
		}

		for _, nodeName := range configuredNodeOrder {
			entry, ok := byNode[nodeName]
			if !ok || !entry.historyAvailable() {
				continue
			}

			selections[key] = sharedStorageSelection{
				storage:    storage,
				sourceNode: nodeName,
				points:     entry.points,
			}
			break
		}
	}

	return selections
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
		if !isNodeLocalStorage(entry.storage, sharedStorageNames) {
			continue
		}
		if !entry.historyAvailable() {
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
	configuredNodeOrder []string,
) []UsageHistoryPoint {
	buckets := make(map[int64]*usageBucket)
	sharedSelections := selectSharedStorageHistories(
		results,
		configuredNodeOrder,
		sharedStorageNames,
	)

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
			if !isNodeLocalStorage(entry.storage, sharedStorageNames) {
				continue
			}
			if !entry.historyAvailable() {
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

	for _, selection := range sharedSelections {
		for _, point := range selection.points {
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
	configuredNodeOrder []string,
) []SharedStorageUsageHistory {
	selections := selectSharedStorageHistories(
		results,
		configuredNodeOrder,
		sharedStorageNames,
	)

	keys := make([]string, 0, len(selections))
	for key := range selections {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	histories := make([]SharedStorageUsageHistory, 0, len(keys))
	for _, key := range keys {
		selection := selections[key]
		histories = append(histories, SharedStorageUsageHistory{
			Storage:    selection.storage.Storage,
			Type:       selection.storage.Type,
			SourceNode: selection.sourceNode,
			Points:     buildStorageOnlyUsageHistoryPoints(selection.points),
		})
	}

	return histories
}
