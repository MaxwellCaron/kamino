import type { ApiTreeNode } from "@/lib/queries"

export const TREE_ROOT_ID = "root"
export const TREE_INDENT = 12

export const VIRTUAL_ROOT: ApiTreeNode = {
  id: TREE_ROOT_ID,
  name: "Root",
  kind: "folder",
  permissions: { allowed_mask: 0, denied_mask: 0, request_mask: 0 },
}
