"use client"

import {
  IconDots,
  IconEdit,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconLock,
  IconPin,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
  IconServer,
  IconServerSpark,
  IconTrash,
} from "@tabler/icons-react"
import { useCallback, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useSidebar } from "@workspace/ui/components/sidebar"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
  useTree,
  useTreeNode,
} from "@workspace/ui/components/tree"
import { Button } from "@workspace/ui/components/button"
import type { ReactNode } from "react"

// API response types matching GET /api/v1/inventory/tree
type ApiTreeNode = {
  id: string
  name: string
  kind: "folder" | "vm"
  children?: Array<ApiTreeNode>
  vm?: {
    node: string
    vmid: number
    cpu_count?: number
    memory_mb?: number
    disk_gb?: number
  }
}

// Internal tree node used for rendering and drag-and-drop
type FileNode = {
  id: string
  name: string
  children?: Array<FileNode>
  icon?: ReactNode
}

function mapApiToTree(nodes: Array<ApiTreeNode>): Array<FileNode> {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    ...(node.kind === "folder"
      ? { children: node.children ? mapApiToTree(node.children) : [] }
      : { icon: <IconServer /> }),
  }))
}

function findNode(nodes: Array<FileNode>, id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function removeNode(
  nodes: Array<FileNode>,
  id: string
): [Array<FileNode>, FileNode | null] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const removed = nodes[index]
    return [nodes.filter((_, i) => i !== index), removed]
  }

  let removed: FileNode | null = null
  const result = nodes.map((node) => {
    if (!node.children || removed) return node
    const [newChildren, found] = removeNode(node.children, id)
    if (found) {
      removed = found
      return { ...node, children: newChildren }
    }
    return node
  })

  return [result, removed]
}

function isDescendant(
  nodes: Array<FileNode>,
  parentId: string,
  childId: string
): boolean {
  const parent = findNode(nodes, parentId)
  if (!parent?.children) return false
  for (const child of parent.children) {
    if (child.id === childId) return true
    if (child.children && isDescendant([child], child.id, childId)) return true
  }
  return false
}

function sortNodes(nodes: Array<FileNode>): Array<FileNode> {
  return [...nodes]
    .sort((a, b) => {
      const aIsFolder = a.children !== undefined ? 0 : 1
      const bIsFolder = b.children !== undefined ? 0 : 1
      if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder
      return a.name.localeCompare(b.name)
    })
    .map((node) =>
      node.children ? { ...node, children: sortNodes(node.children) } : node
    )
}

function insertIntoNode(
  nodes: Array<FileNode>,
  targetId: string,
  nodeToInsert: FileNode
): Array<FileNode> {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        children: [...(node.children ?? []), nodeToInsert],
      }
    }
    if (node.children) {
      return {
        ...node,
        children: insertIntoNode(node.children, targetId, nodeToInsert),
      }
    }
    return node
  })
}

function NodeMenu({ isFolder }: { isFolder: boolean }) {
  const { selectNode } = useTree()
  const { nodeId } = useTreeNode()
  const { isMobile } = useSidebar()

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          selectNode(nodeId)
        }
      }}
    >
      <DropdownMenuTrigger
        className="opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="icon-xs">
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isMobile ? "end" : "start"}>
        {isFolder ? (
          <>
            <DropdownMenuItem>
              <IconFolderPlus />
              Create Folder
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconServerSpark />
              Create VM
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <IconPin />
              Pin
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconEdit />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconLock />
              Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <IconTrash />
              Delete
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem>
              <IconPlayerPlay />
              Start
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconPower />
              Shutdown
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconRefresh />
              Reboot
            </DropdownMenuItem>
            <DropdownMenuItem>
              <IconPlayerStop />
              Stop
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <IconTrash />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function renderTree(
  nodes: Array<FileNode>,
  level: number,
  parentPath: Array<boolean>
): ReactNode {
  return nodes.map((node, index) => {
    const isLast = index === nodes.length - 1
    const isFolder = node.children !== undefined
    const hasChildren = isFolder && node.children!.length > 0

    return (
      <TreeNode
        key={node.id}
        droppable={isFolder}
        isLast={isLast}
        level={level}
        nodeId={node.id}
        parentPath={parentPath}
      >
        <TreeNodeTrigger>
          <TreeExpander hasChildren={isFolder} />
          <TreeIcon hasChildren={isFolder} icon={node.icon} />
          <TreeLabel>{node.name}</TreeLabel>
          <NodeMenu isFolder={isFolder} />
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren>
            {renderTree(
              node.children!,
              level + 1,
              level === 0 ? [] : [...parentPath.slice(0, level - 1), isLast]
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  })
}

function collectFolderIds(nodes: Array<FileNode>): Array<string> {
  const ids: Array<string> = []
  for (const node of nodes) {
    if (node.children) {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }
  return ids
}

async function fetchInventoryTree(): Promise<Array<ApiTreeNode>> {
  const res = await fetch("/api/v1/inventory/tree")
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.status}`)
  return res.json()
}

export function InventoryTree() {
  const navigate = useNavigate()

  const {
    data: apiTree,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["inventory", "tree"],
    queryFn: fetchInventoryTree,
  })

  const [localTree, setLocalTree] = useState<Array<FileNode>>([])
  const [initialized, setInitialized] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Array<string>>([])

  // Sync API data into local state for drag-and-drop manipulation
  if (apiTree && !initialized) {
    setLocalTree(mapApiToTree(apiTree))
    setInitialized(true)
  }

  const tree = initialized ? localTree : []

  const handleSelectionChange = useCallback(
    (ids: Array<string>) => {
      setSelectedIds(ids)
      if (ids.length !== 1) return
      const id = ids[0]
      const node = findNode(tree, id)
      if (node && !node.children) {
        navigate({ to: "/vm/$itemId", params: { itemId: id } })
      }
    },
    [tree, navigate]
  )

  const handleMove = useCallback(
    (sourceId: string, rawTargetId: string) => {
      const targetId = rawTargetId.startsWith("drop-")
        ? rawTargetId.slice(5)
        : rawTargetId

      if (sourceId === targetId) return
      if (isDescendant(tree, sourceId, targetId)) return

      const [treeWithoutSource, removedNode] = removeNode(tree, sourceId)
      if (!removedNode) return

      const updated = insertIntoNode(treeWithoutSource, targetId, removedNode)
      setLocalTree(sortNodes(updated))
    },
    [tree]
  )

  const renderOverlay = useCallback(
    (draggedId: string) => {
      const node = findNode(tree, draggedId)
      if (!node) return null

      const hasChildren = !!node.children

      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 opacity-50 shadow-xl shadow-black/20">
          <span className="text-muted-foreground">
            {hasChildren ? (
              <IconFolder />
            ) : node.icon ? (
              node.icon
            ) : (
              <IconFile />
            )}
          </span>
          <span className="text-sm font-medium">{node.name}</span>
        </div>
      )
    },
    [tree]
  )

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">Loading...</div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">
        No inventory items
      </div>
    )
  }

  return (
    <TreeProvider
      defaultExpandedIds={collectFolderIds(tree)}
      indent={12}
      selectedIds={selectedIds}
      onSelectionChange={handleSelectionChange}
      onMove={handleMove}
      renderDragOverlay={renderOverlay}
    >
      <TreeView className="p-0">{renderTree(tree, 0, [])}</TreeView>
    </TreeProvider>
  )
}
