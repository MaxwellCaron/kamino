import type { ApiTreeNode } from "@/lib/inventory/inventory-types"
import { VIRTUAL_ROOT } from "@/lib/inventory/constants"

export interface SelectionState {
  activeItemId?: string
  itemIds: Array<string>
}

export interface FlatTree {
  items: Map<string, ApiTreeNode>
  children: Map<string, Array<string>>
  folderIds: Array<string>
  parentIds: Map<string, string>
}

export function flattenApiTree(roots: Array<ApiTreeNode>): FlatTree {
  const items = new Map<string, ApiTreeNode>()
  const children = new Map<string, Array<string>>()
  const folderIds: Array<string> = []
  const parentIds = new Map<string, string>()

  function walk(node: ApiTreeNode, parentId: string) {
    items.set(node.id, node)
    parentIds.set(node.id, parentId)
    if (node.kind === "folder") {
      folderIds.push(node.id)
    }
    if (node.children?.length) {
      children.set(
        node.id,
        node.children.map((child) => child.id)
      )
      for (const child of node.children) walk(child, node.id)
    }
  }

  for (const root of roots) walk(root, VIRTUAL_ROOT.id)

  items.set(VIRTUAL_ROOT.id, VIRTUAL_ROOT)
  children.set(
    VIRTUAL_ROOT.id,
    roots.map((root) => root.id)
  )
  folderIds.push(VIRTUAL_ROOT.id)

  return { items, children, folderIds, parentIds }
}

export function buildVmIdMap(
  items: Map<string, ApiTreeNode>
): Map<string, number> {
  const map = new Map<string, number>()

  for (const [id, node] of items) {
    if (node.kind === "vm" && node.vm?.vmid !== undefined) {
      map.set(id, node.vm.vmid)
    }
  }

  return map
}
