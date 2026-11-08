import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/lib/inventory/inventory-types"

import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/lib/inventory/inventory-api"
import type { QueryClient } from "@tanstack/react-query"
import { findTreePath } from "@/lib/inventory/inventory-tree"

export async function loadInventoryItemRouteSources(
  queryClient: QueryClient,
  itemId: string
): Promise<{
  item: ApiInventoryItem | null
  treePath: Array<ApiTreeNode> | null
}> {
  const cachedTree = queryClient.getQueryData<Array<ApiTreeNode>>(
    inventoryTreeQueryOptions.queryKey
  )
  const cachedTreePath = cachedTree ? findTreePath(cachedTree, itemId) : null

  if (cachedTreePath) {
    return { item: null, treePath: cachedTreePath }
  }

  const [item, tree] = await Promise.all([
    queryClient
      .ensureQueryData(inventoryItemQueryOptions(itemId))
      .catch(() => null),
    queryClient.ensureQueryData(inventoryTreeQueryOptions).catch(() => null),
  ])

  return {
    item,
    treePath: tree ? findTreePath(tree, itemId) : null,
  }
}
