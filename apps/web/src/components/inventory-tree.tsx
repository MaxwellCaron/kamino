import {
  IconFolder,
  IconSearch,
  IconServer,
  IconTemplate,
} from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
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
import type { ApiTreeNode } from "@/lib/queries"
import type { ReactNode } from "react"
import { useMoveInventoryItem } from "@/hooks/use-inventory-actions"
import { sortInventoryTree } from "@/lib/inventory-tree"
import { inventoryTreeQueryOptions, vmStatusQueryOptions } from "@/lib/queries"

function collectVmIds(nodes: Array<ApiTreeNode>): Map<string, number> {
  const map = new Map<string, number>()

  for (const node of nodes) {
    if (node.kind === "vm" && node.vm?.vmid !== undefined) {
      map.set(node.id, node.vm.vmid)
    }
    if (node.children) {
      for (const [id, vmid] of collectVmIds(node.children)) {
        map.set(id, vmid)
      }
    }
  }

  return map
}

function findNode(nodes: Array<ApiTreeNode>, id: string): ApiTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function findParentId(
  nodes: Array<ApiTreeNode>,
  id: string,
  parentId: string | null = null
): string | null {
  for (const node of nodes) {
    if (node.id === id) return parentId
    if (node.children) {
      const found = findParentId(node.children, id, node.id)
      if (found !== null) return found
    }
  }
  return null
}

function removeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): [Array<ApiTreeNode>, ApiTreeNode | null] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const removed = nodes[index]
    return [nodes.filter((_, currentIndex) => currentIndex !== index), removed]
  }

  let removed: ApiTreeNode | null = null
  const result = nodes.map((node) => {
    if (!node.children || removed) return node
    const [nextChildren, found] = removeNode(node.children, id)
    if (!found) return node
    removed = found
    return { ...node, children: nextChildren }
  })

  return [result, removed]
}

function insertIntoNode(
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
      children: insertIntoNode(node.children, targetId, nodeToInsert),
    }
  })
}

function moveNode(
  nodes: Array<ApiTreeNode>,
  sourceId: string,
  targetId: string
): Array<ApiTreeNode> {
  if (sourceId === targetId || isDescendant(nodes, sourceId, targetId)) {
    return nodes
  }

  const [treeWithoutSource, removedNode] = removeNode(nodes, sourceId)
  if (!removedNode) return nodes

  return sortInventoryTree(
    insertIntoNode(treeWithoutSource, targetId, removedNode)
  )
}

function isDescendant(
  nodes: Array<ApiTreeNode>,
  parentId: string,
  childId: string
): boolean {
  const parent = findNode(nodes, parentId)
  if (!parent?.children) return false

  for (const child of parent.children) {
    if (child.id === childId) return true
    if (child.kind === "folder" && isDescendant([child], child.id, childId)) {
      return true
    }
  }

  return false
}

function filterTree(
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

function countLeaves(nodes: Array<ApiTreeNode>): number {
  let count = 0
  for (const node of nodes) {
    if (node.kind === "folder") count += countLeaves(node.children ?? [])
    else count++
  }
  return count
}

function collectFolderIds(nodes: Array<ApiTreeNode>): Array<string> {
  const ids: Array<string> = []

  for (const node of nodes) {
    if (node.kind !== "folder") continue
    ids.push(node.id)
    ids.push(...collectFolderIds(node.children ?? []))
  }

  return ids
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
  nodes: Array<ApiTreeNode>,
  level: number,
  parentPath: Array<boolean>,
  getStatus: (id: string) => string | undefined
): ReactNode {
  return nodes.map((node, index) => {
    const isLast = index === nodes.length - 1
    const isFolder = node.kind === "folder"
    const hasChildren = isFolder && (node.children?.length ?? 0) > 0

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
                  isTemplate={node.vm?.is_template}
                />
              ) : undefined
            }
          />
          <TreeLabel>{node.name}</TreeLabel>
          <TreeNodeMenu
            isFolder={isFolder}
            isTemplate={node.vm?.is_template}
            name={node.name}
            pveNode={node.vm?.node}
            vmid={node.vm?.vmid}
          />
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren>
            {renderTree(
              node.children ?? [],
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

export function InventoryTree() {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Array<string>>([])
  const [localTree, setLocalTree] = useState<Array<ApiTreeNode>>([])

  const {
    data: tree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItem = useMoveInventoryItem()

  useEffect(() => {
    setLocalTree(tree)
  }, [tree])

  const displayTree = localTree
  const vmIdMap = collectVmIds(displayTree)
  const filteredTree = filterTree(displayTree, query)
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

  const effectiveSelectedIds =
    selectedIds.length > 0
      ? selectedIds
      : activeItemId && findNode(displayTree, activeItemId)
        ? [activeItemId]
        : []

  const handleSelectionChange = useCallback(
    (ids: Array<string>) => {
      setSelectedIds(ids)
      if (ids.length !== 1) return

      const id = ids[0]
      const node = findNode(displayTree, id)
      if (node?.kind === "vm") {
        navigate({ to: "/vm/$itemId", params: { itemId: id } })
      }
    },
    [displayTree, navigate]
  )

  const handleMove = useCallback(
    (sourceId: string, rawTargetId: string) => {
      const targetId = rawTargetId.startsWith("drop-")
        ? rawTargetId.slice(5)
        : rawTargetId

      const currentParentId = findParentId(displayTree, sourceId)

      if (
        sourceId === targetId ||
        currentParentId === targetId ||
        isDescendant(displayTree, sourceId, targetId)
      ) {
        return
      }

      setLocalTree((currentTree) => moveNode(currentTree, sourceId, targetId))

      moveItem.mutate(
        { itemId: sourceId, parentId: targetId },
        {
          onError: (mutationError) => {
            setLocalTree(tree)
            toast.error(mutationError.message)
          },
        }
      )
    },
    [displayTree, moveItem, tree]
  )

  const renderOverlay = useCallback(
    (draggedId: string) => {
      const node = findNode(displayTree, draggedId)
      if (!node) return null

      return (
        <div className="flex items-center gap-2 rounded-3xl border border-border/60 bg-card px-3 py-2 opacity-50 shadow-xl shadow-black/20">
          <span className="text-muted-foreground">
            {node.kind === "folder" ? (
              <IconFolder />
            ) : node.vm?.is_template ? (
              <IconTemplate />
            ) : (
              <IconServer />
            )}
          </span>
          <span className="text-sm font-medium">{node.name}</span>
        </div>
      )
    },
    [displayTree]
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

  if (displayTree.length === 0) {
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
        defaultExpandedIds={collectFolderIds(displayTree)}
        expandedIds={query ? collectFolderIds(filteredTree) : undefined}
        indent={12}
        selectedIds={effectiveSelectedIds}
        onMove={handleMove}
        onSelectionChange={handleSelectionChange}
        renderDragOverlay={renderOverlay}
      >
        <TreeView className="p-0">
          {renderTree(filteredTree, 0, [], getStatus)}
        </TreeView>
      </TreeProvider>
    </>
  )
}
