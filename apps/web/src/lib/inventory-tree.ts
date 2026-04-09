import type { ApiTreeNode } from "@/lib/queries"

export const INVENTORY_KIND_SORT_ORDER = {
  folder: 0,
  vm: 1,
} as const

const inventoryNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function compareInventoryNodes(
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
