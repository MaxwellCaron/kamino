import { VIRTUAL_ROOT } from "./constants"
import type { ApiTreeNode } from "../types/inventory-types"

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

export function filterTree(
  nodes: Array<ApiTreeNode>,
  query: string
): Array<ApiTreeNode> {
  if (!query) return nodes

  const normalizedQuery = query.toLowerCase()
  const result: Array<ApiTreeNode> = []

  for (const node of nodes) {
    if (node.kind === "folder") {
      const filteredChildren = filterTree(node.children ?? [], query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      } else if (node.name.toLowerCase().includes(normalizedQuery)) {
        result.push(node)
      }
      continue
    }

    if (node.name.toLowerCase().includes(normalizedQuery)) {
      result.push(node)
    }
  }

  return result
}

export function countLeaves(nodes: Array<ApiTreeNode>): number {
  let count = 0

  for (const node of nodes) {
    if (node.kind === "folder") {
      count += countLeaves(node.children ?? [])
    } else {
      count++
    }
  }

  return count
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
