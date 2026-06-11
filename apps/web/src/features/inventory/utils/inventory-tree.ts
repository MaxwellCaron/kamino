import { hasDirectInventoryCapability } from "./inventory-capabilities"
import type { ApiTreeNode } from "../types/inventory-types"

const INVENTORY_KIND_SORT_ORDER = {
  folder: 0,
  vm: 1,
} as const

const inventoryNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

function compareInventoryNodes(
  left: ApiTreeNode,
  right: ApiTreeNode
): number {
  const leftOrder = INVENTORY_KIND_SORT_ORDER[left.kind]
  const rightOrder = INVENTORY_KIND_SORT_ORDER[right.kind]

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  return inventoryNameCollator.compare(left.name, right.name)
}

export function sortInventoryTree(
  nodes: Array<ApiTreeNode>
): Array<ApiTreeNode> {
  return [...nodes]
    .sort(compareInventoryNodes)
    .map((node) =>
      node.children
        ? { ...node, children: sortInventoryTree(node.children) }
        : node
    )
}

export function findInventoryTreeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): ApiTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findInventoryTreeNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function findTreePath(
  nodes: Array<ApiTreeNode>,
  id: string,
  parents: Array<ApiTreeNode> = []
): Array<ApiTreeNode> | null {
  for (const node of nodes) {
    const path = [...parents, node]

    if (node.id === id) {
      return path
    }

    if (node.children) {
      const found = findTreePath(node.children, id, path)
      if (found) {
        return found
      }
    }
  }

  return null
}

function removeInventoryTreeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): [Array<ApiTreeNode>, ApiTreeNode | null] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const removed = nodes[index]
    return [nodes.filter((_, currentIndex) => currentIndex !== index), removed]
  }

  let removed: ApiTreeNode | null = null
  const nextNodes = nodes.map((node) => {
    if (!node.children || removed) return node
    const [nextChildren, found] = removeInventoryTreeNode(node.children, id)
    if (!found) return node
    removed = found
    return { ...node, children: nextChildren }
  })

  return [nextNodes, removed]
}

function insertInventoryTreeNode(
  nodes: Array<ApiTreeNode>,
  targetId: string,
  nodeToInsert: ApiTreeNode
): Array<ApiTreeNode> {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        children: sortInventoryTree([...(node.children ?? []), nodeToInsert]),
      }
    }
    if (!node.children) return node
    return {
      ...node,
      children: insertInventoryTreeNode(node.children, targetId, nodeToInsert),
    }
  })
}

function isInventoryDescendant(
  nodes: Array<ApiTreeNode>,
  parentId: string,
  childId: string
): boolean {
  const parent = findInventoryTreeNode(nodes, parentId)
  if (!parent?.children) return false

  for (const child of parent.children) {
    if (child.id === childId) return true
    if (
      child.kind === "folder" &&
      isInventoryDescendant([child], child.id, childId)
    ) {
      return true
    }
  }

  return false
}

function moveInventoryTreeNode(
  nodes: Array<ApiTreeNode>,
  sourceId: string,
  targetId: string
): Array<ApiTreeNode> {
  if (
    sourceId === targetId ||
    isInventoryDescendant(nodes, sourceId, targetId)
  ) {
    return nodes
  }

  const [treeWithoutSource, removedNode] = removeInventoryTreeNode(
    nodes,
    sourceId
  )
  if (!removedNode) return nodes

  return sortInventoryTree(
    insertInventoryTreeNode(treeWithoutSource, targetId, removedNode)
  )
}

export function moveInventoryTreeNodes(
  nodes: Array<ApiTreeNode>,
  sourceIds: Array<string>,
  targetId: string
): Array<ApiTreeNode> {
  return sourceIds.reduce(
    (currentTree, sourceId) =>
      moveInventoryTreeNode(currentTree, sourceId, targetId),
    nodes
  )
}

export type InventoryFolderOption = {
  id: string
  name: string
  label: string
  path: Array<string>
  pool: string
}

function encodeInventoryPoolPath(path: Array<string>): string {
  return path.map((segment) => segment.replaceAll("_", "__")).join("_")
}

export function getInventoryFolderOptions(
  nodes: Array<ApiTreeNode> | undefined
): Array<InventoryFolderOption> {
  if (!nodes) return []

  const folders: Array<InventoryFolderOption> = []

  function walk(entries: Array<ApiTreeNode>, ancestors: Array<string>) {
    for (const entry of entries) {
      if (entry.kind !== "folder") continue

      const nextPath = [...ancestors, entry.name]
      const isRootFolder = ancestors.length === 0
      const folderPath = isRootFolder ? [] : nextPath.slice(1)

      if (
        !isRootFolder &&
        hasDirectInventoryCapability(entry.permissions, "view")
      ) {
        folders.push({
          id: entry.id,
          name: entry.name,
          label: folderPath.join(" / "),
          path: folderPath,
          pool: encodeInventoryPoolPath(folderPath),
        })
      }

      if (entry.children?.length) {
        walk(entry.children, nextPath)
      }
    }
  }

  walk(nodes, [])

  return folders.sort((left, right) => left.label.localeCompare(right.label))
}

export function getSelectedFolder(
  folderOptions: Array<InventoryFolderOption>,
  folderId: string
) {
  return folderOptions.find((folder) => folder.id === folderId)
}

export type FolderDeletionSummary = {
  folderCount: number
  vmCount: number
  templateCount: number
  folderNames: Array<string>
  vmNames: Array<string>
  templateNames: Array<string>
}

export function summarizeFolderDeletion(
  node: ApiTreeNode,
  maxPreviewItems = 3
): FolderDeletionSummary {
  const summary: FolderDeletionSummary = {
    folderCount: 0,
    vmCount: 0,
    templateCount: 0,
    folderNames: [],
    vmNames: [],
    templateNames: [],
  }

  function visit(current: ApiTreeNode) {
    if (current.kind === "folder") {
      summary.folderCount += 1
      if (summary.folderNames.length < maxPreviewItems) {
        summary.folderNames.push(current.name)
      }
      for (const child of current.children ?? []) {
        visit(child)
      }
      return
    }

    const label =
      current.vm?.vmid !== undefined
        ? `${current.name} (${current.vm.vmid})`
        : current.name

    if (current.vm?.is_template) {
      summary.templateCount += 1
      if (summary.templateNames.length < maxPreviewItems) {
        summary.templateNames.push(label)
      }
      return
    }

    summary.vmCount += 1
    if (summary.vmNames.length < maxPreviewItems) {
      summary.vmNames.push(label)
    }
  }

  visit(node)
  return summary
}
