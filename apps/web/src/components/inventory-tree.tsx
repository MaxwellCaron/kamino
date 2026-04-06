"use client"

import {
  IconFolder,
  IconSearch,
  IconServer,
  IconTemplate,
} from "@tabler/icons-react"
import { useCallback, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@workspace/ui/components/tree"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { TreeNodeMenu } from "./inventory-actions"
import type { ReactNode } from "react"
import type { ApiTreeNode } from "@/lib/queries"
import { inventoryTreeQueryOptions, vmStatusQueryOptions } from "@/lib/queries"

// Internal tree node used for rendering and drag-and-drop
type FileNode = {
  id: string
  name: string
  vmid?: number
  pveNode?: string
  isTemplate?: boolean
  children?: Array<FileNode>
}

function mapApiToTree(nodes: Array<ApiTreeNode>): Array<FileNode> {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    ...(node.kind === "folder"
      ? { children: node.children ? mapApiToTree(node.children) : [] }
      : {
          vmid: node.vm?.vmid,
          pveNode: node.vm?.node,
          isTemplate: node.vm?.is_template,
        }),
  }))
}

// Build a flat map of inventory item id → vmid for status lookups
function collectVmIds(nodes: Array<FileNode>): Map<string, number> {
  const map = new Map<string, number>()
  for (const node of nodes) {
    if (node.vmid !== undefined) map.set(node.id, node.vmid)
    if (node.children) {
      for (const [id, vmid] of collectVmIds(node.children)) {
        map.set(id, vmid)
      }
    }
  }
  return map
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

function VmIcon({
  status,
  isTemplate,
}: {
  status: string | undefined
  isTemplate?: boolean
}) {
  if (isTemplate) {
    return <IconTemplate className="size-4 text-muted-foreground" />
  }

  const color = status
    ? status === "running"
      ? "bg-green-600 dark:bg-green-400"
      : status === "stopped"
        ? "bg-muted-foreground/40"
        : "bg-yellow-600 dark:bg-yellow-400"
    : undefined

  return (
    <span className="relative">
      <IconServer className="size-4" />
      {color && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background ${color}`}
          title={status}
        />
      )}
    </span>
  )
}

function renderTree(
  nodes: Array<FileNode>,
  level: number,
  parentPath: Array<boolean>,
  getStatus: (id: string) => string | undefined
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
          <TreeIcon
            hasChildren={isFolder}
            icon={
              !isFolder ? (
                <VmIcon
                  status={getStatus(node.id)}
                  isTemplate={node.isTemplate}
                />
              ) : undefined
            }
          />
          <TreeLabel>{node.name}</TreeLabel>
          <TreeNodeMenu
            isFolder={isFolder}
            isTemplate={node.isTemplate}
            vmid={node.vmid}
            pveNode={node.pveNode}
          />
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren>
            {renderTree(
              node.children!,
              level + 1,
              level === 0 ? [] : [...parentPath.slice(0, level - 1), isLast],
              getStatus
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  })
}

function filterTree(nodes: Array<FileNode>, query: string): Array<FileNode> {
  if (!query) return nodes
  const q = query.toLowerCase()
  const result: Array<FileNode> = []
  for (const node of nodes) {
    if (node.children !== undefined) {
      const filteredChildren = filterTree(node.children, query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      } else if (node.name.toLowerCase().includes(q)) {
        result.push(node)
      }
    } else if (node.name.toLowerCase().includes(q)) {
      result.push(node)
    }
  }
  return result
}

function countLeaves(nodes: Array<FileNode>): number {
  let count = 0
  for (const node of nodes) {
    if (node.children !== undefined) count += countLeaves(node.children)
    else count++
  }
  return count
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

export function InventoryTree() {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [query, setQuery] = useState("")

  const {
    data: apiTree,
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)

  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  const [localTree, setLocalTree] = useState<Array<FileNode>>([])
  const [initialized, setInitialized] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Array<string>>([])
  const [vmIdMap, setVmIdMap] = useState<Map<string, number>>(new Map())

  // Sync API data into local state for drag-and-drop manipulation
  if (apiTree && !initialized) {
    const mapped = mapApiToTree(apiTree)
    setLocalTree(mapped)
    setVmIdMap(collectVmIds(mapped))
    setInitialized(true)
  }

  const tree = initialized ? localTree : []
  const filteredTree = filterTree(tree, query)
  const resultCount = query ? countLeaves(filteredTree) : null

  const getStatus = useCallback(
    (itemId: string): string | undefined => {
      if (!vmStatuses) return undefined
      const vmid = vmIdMap.get(itemId)
      if (vmid === undefined) return undefined
      return vmStatuses[vmid]
    },
    [vmStatuses, vmIdMap]
  )

  // Use route-derived selection on refresh, user clicks take priority
  const effectiveSelectedIds =
    selectedIds.length > 0
      ? selectedIds
      : activeItemId && findNode(tree, activeItemId)
        ? [activeItemId]
        : []

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
            ) : node.isTemplate ? (
              <IconTemplate />
            ) : (
              <IconServer />
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
    <>
      <InputGroup className="mb-2">
        <InputGroupInput
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        {resultCount !== null && (
          <InputGroupAddon align="inline-end">
            {resultCount} results
          </InputGroupAddon>
        )}
      </InputGroup>
      <TreeProvider
        defaultExpandedIds={collectFolderIds(tree)}
        expandedIds={query ? collectFolderIds(filteredTree) : undefined}
        indent={12}
        selectedIds={effectiveSelectedIds}
        onSelectionChange={handleSelectionChange}
        onMove={handleMove}
        renderDragOverlay={renderOverlay}
      >
        <TreeView className="p-0">
          {renderTree(filteredTree, 0, [], getStatus)}
        </TreeView>
      </TreeProvider>
    </>
  )
}
