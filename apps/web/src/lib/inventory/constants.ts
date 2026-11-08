import type { ApiTreeNode } from "./inventory-types"

const TREE_ROOT_ID = "root"
export const TREE_INDENT = 12

export const VIRTUAL_ROOT: ApiTreeNode = {
  id: TREE_ROOT_ID,
  name: "Root",
  kind: "folder",
  permissions: { allowed_mask: 0, denied_mask: 0, request_mask: 0 },
}

export const principalTypeLabels = {
  group: "Group",
  user: "User",
} as const

export const INVENTORY_TREE_ROW_GAP = 2

const INVENTORY_TREE_ROW_CONTENT_HEIGHT = 32

export const INVENTORY_TREE_ROW_HEIGHT =
  INVENTORY_TREE_ROW_CONTENT_HEIGHT + INVENTORY_TREE_ROW_GAP
