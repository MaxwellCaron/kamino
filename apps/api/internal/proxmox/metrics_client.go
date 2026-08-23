package proxmox

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"sync"

	"golang.org/x/sync/errgroup"
)

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

func (c *Client) getNodeUsageHistory(
	ctx context.Context,
	node Node,
	timeframe string,
) (nodeHistoryResult, error) {
	usagePoints, err := c.GetNodeRRDData(ctx, node.Node, timeframe, "AVERAGE")
	if err != nil {
		return nodeHistoryResult{}, err
	}

	storages, err := c.GetStorages(ctx, node.Node)
	if err != nil {
		return nodeHistoryResult{
			node:             node,
			usagePoints:      usagePoints,
			storageHistories: []storageWithHistory{},
		}, nil
	}

	storageHistories := make([]storageWithHistory, 0, len(storages))
	storageGroup, storageCtx := errgroup.WithContext(ctx)
	var storageMu sync.Mutex

	for _, storage := range storages {
		storageGroup.Go(func() error {
			points, fetchErr := c.GetStorageRRDData(
				storageCtx,
				node.Node,
				storage.Storage,
				timeframe,
				"AVERAGE",
			)

			storageMu.Lock()
			storageHistories = append(storageHistories, storageWithHistory{
				storage:  storage,
				points:   points,
				fetchErr: fetchErr,
			})
			storageMu.Unlock()
			return nil
		})
	}

	if err := storageGroup.Wait(); err != nil {
		return nodeHistoryResult{}, err
	}

	return nodeHistoryResult{
		node:             node,
		usagePoints:      usagePoints,
		storageHistories: storageHistories,
	}, nil
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

	resultsByIndex := make([]nodeHistoryResult, len(nodes))
	available := make([]bool, len(nodes))
	var (
		resultMu   sync.Mutex
		nodeErrors []error
	)

	group, groupCtx := errgroup.WithContext(ctx)
	for index, node := range nodes {
		group.Go(func() error {
			result, err := c.getNodeUsageHistory(groupCtx, node, normalizedTimeframe)
			resultMu.Lock()
			defer resultMu.Unlock()
			if err != nil {
				nodeErrors = append(nodeErrors, err)
				return nil
			}
			resultsByIndex[index] = result
			available[index] = true
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return ClusterUsageHistory{}, err
	}

	results := make([]nodeHistoryResult, 0, len(nodes))
	for index := range resultsByIndex {
		if available[index] {
			results = append(results, resultsByIndex[index])
		}
	}
	if len(results) == 0 {
		return ClusterUsageHistory{}, fmt.Errorf(
			"failed to fetch usage history for all managed nodes: %w",
			errors.Join(nodeErrors...),
		)
	}

	nodeHistories := make([]NodeUsageHistory, len(results))
	for index, result := range results {
		nodeHistories[index] = NodeUsageHistory{
			Node:   result.node.Node,
			Points: buildNodeUsageHistoryPoints(result, sharedStorageNames),
		}
	}

	return ClusterUsageHistory{
		Points: buildClusterUsageHistoryPoints(
			results,
			sharedStorageNames,
			c.nodes,
		),
		Nodes: nodeHistories,
		SharedStorages: buildSharedStorageUsageHistories(
			results,
			sharedStorageNames,
			c.nodes,
		),
	}, nil
}
