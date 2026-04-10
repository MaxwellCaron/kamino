import type { ApiTreeNode } from "@/lib/queries"

export const INVENTORY_KIND_SORT_ORDER = {
  folder: 0,
  vm: 1,
} as const

const PROXMOX_ROOT_FOLDER_NAME = "Proxmox"

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

export type InventoryFolderOption = {
  id: string
  name: string
  label: string
  path: Array<string>
  pool: string
}

export function encodeInventoryPoolPath(path: Array<string>): string {
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
      const isRootFolder =
        entry.name === PROXMOX_ROOT_FOLDER_NAME && ancestors.length === 0
      const folderPath = isRootFolder
        ? []
        : nextPath[0] === PROXMOX_ROOT_FOLDER_NAME
          ? nextPath.slice(1)
          : nextPath

      if (!isRootFolder) {
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

export function getParentFolderIdForItem(
  nodes: Array<ApiTreeNode> | undefined,
  itemId: string
): string | undefined {
  if (!nodes) return undefined

  function walk(
    entries: Array<ApiTreeNode>,
    parentFolderId?: string
  ): string | undefined {
    for (const entry of entries) {
      if (entry.id === itemId) {
        return parentFolderId
      }

      if (!entry.children?.length) continue

      const nextParentId = entry.kind === "folder" ? entry.id : parentFolderId
      const found = walk(entry.children, nextParentId)

      if (found) return found
    }

    return undefined
  }

  return walk(nodes)
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
