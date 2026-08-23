package proxmox

import (
	"math"
	"strings"
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
	Storage    string              `json:"storage"`
	Type       string              `json:"type"`
	SourceNode string              `json:"source_node"`
	Points     []UsageHistoryPoint `json:"points"`
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
	storage  Storage
	points   []rrdDataPoint
	fetchErr error
}

type sharedStorageSelection struct {
	storage    Storage
	sourceNode string
	points     []rrdDataPoint
}

func (entry storageWithHistory) historyAvailable() bool {
	return entry.fetchErr == nil
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

func wouldBeSharedStorageByHeuristic(storage Storage) bool {
	if storage.Shared != nil && *storage.Shared == 1 {
		return true
	}
	_, ok := sharedStorageTypes[strings.ToLower(storage.Type)]
	return ok
}

func isSharedStorage(storage Storage, overrideNames map[string]struct{}) bool {
	if len(overrideNames) > 0 {
		_, ok := overrideNames[storage.Storage]
		return ok
	}
	return wouldBeSharedStorageByHeuristic(storage)
}

func isExcludedStorage(storage Storage, overrideNames map[string]struct{}) bool {
	if len(overrideNames) == 0 {
		return false
	}
	if _, ok := overrideNames[storage.Storage]; ok {
		return false
	}
	return wouldBeSharedStorageByHeuristic(storage)
}

func isNodeLocalStorage(storage Storage, overrideNames map[string]struct{}) bool {
	return !isSharedStorage(storage, overrideNames) &&
		!isExcludedStorage(storage, overrideNames)
}

func (c *Client) IsSharedStorage(storage Storage) bool {
	names := c.sharedStorageNames
	if names == nil {
		names = map[string]struct{}{}
	}
	return isSharedStorage(storage, names)
}

func (c *Client) IsExcludedStorage(storage Storage) bool {
	names := c.sharedStorageNames
	if names == nil {
		names = map[string]struct{}{}
	}
	return isExcludedStorage(storage, names)
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
