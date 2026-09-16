import { findInventoryTreeNode } from "./inventory-tree"
import type { ApiTreeNode } from "../types/inventory-types"

export type InventoryRouteRecoveryTarget =
  { type: "home" } | { type: "item"; itemId: string }

export function resolveInventoryRouteRecovery({
  tree,
  itemId,
  wasInitiallyResolved,
  initialAncestorItemIds,
}: {
  tree: Array<ApiTreeNode> | undefined
  itemId: string
  wasInitiallyResolved: boolean
  initialAncestorItemIds: Array<string>
}): InventoryRouteRecoveryTarget | null {
  if (!tree) return null
  if (!wasInitiallyResolved) return null
  if (findInventoryTreeNode(tree, itemId)) return null

  for (let index = initialAncestorItemIds.length - 1; index >= 0; index--) {
    const ancestorId = initialAncestorItemIds[index]
    if (findInventoryTreeNode(tree, ancestorId)) {
      return { type: "item", itemId: ancestorId }
    }
  }

  return { type: "home" }
}
