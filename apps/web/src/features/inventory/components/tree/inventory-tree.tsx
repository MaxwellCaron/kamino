import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { AnimatePresence } from "motion/react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { SidebarGroupLabel } from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { useMoveInventoryItems } from "../../hooks/use-inventory-actions"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useInventoryHeadlessTree } from "../../hooks/use-inventory-headless-tree"
import { VIRTUAL_ROOT } from "../../utils/constants"
import {
  InventoryTreeContext,
  useInventoryTreeContext,
} from "./inventory-tree-context"
import { InventoryFavoritesSection } from "./favorites-section"
import { InventorySelectionActionBar } from "./inventory-selection-action-bar"
import { InventoryTreeContent } from "./tree-content"
import { InventoryTreeSearch } from "./tree-search"
import type { InventoryTreeContextValue } from "./inventory-tree-context"
import type { ApiTreeNode } from "../../types/inventory-types"
import type { ReactNode } from "react"
import { SidebarListSkeleton } from "@/components/loading-skeletons"
import { formatToastError } from "@/features/shared/utils/format"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

interface PendingRevealRequest {
  itemId: string
  requestId: number
}

interface SelectionState {
  activeItemId?: string
  itemIds: Array<string>
}

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [query, setQuery] = useState("")
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null
  )
  const [pendingRevealRequest, setPendingRevealRequest] =
    useState<PendingRevealRequest | null>(null)
  const { favoriteIds, toggleFavorite: toggleSharedFavorite } =
    useInventoryFavorites()

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItems = useMoveInventoryItems()
  const searchQuery = query.trim()
  const isSearchActive = searchQuery.length >= 2

  const filteredApiTree = useMemo(
    () => (isSearchActive ? filterTree(apiTree, searchQuery) : apiTree),
    [apiTree, isSearchActive, searchQuery]
  )
  const resultCount = isSearchActive ? countLeaves(filteredApiTree) : null

  const fullTree = useMemo(() => flattenApiTree(apiTree), [apiTree])

  const {
    items,
    children: treeChildren,
    folderIds,
    parentIds,
  } = useMemo(
    () => (isSearchActive ? flattenApiTree(filteredApiTree) : fullTree),
    [filteredApiTree, fullTree, isSearchActive]
  )

  const selectedItemIds = useMemo(() => {
    const itemIdsForActiveRoute =
      activeItemId === undefined ? [] : [activeItemId]
    const itemIds =
      selectionState?.activeItemId === activeItemId
        ? (selectionState?.itemIds ?? [])
        : itemIdsForActiveRoute

    return itemIds.filter(
      (itemId) => itemId === activeItemId || items.has(itemId)
    )
  }, [activeItemId, items, selectionState])

  const setSelectedItemIds = useCallback(
    (updater: Array<string> | ((prev: Array<string>) => Array<string>)) => {
      setSelectionState({
        activeItemId,
        itemIds:
          typeof updater === "function" ? updater(selectedItemIds) : updater,
      })
    },
    [activeItemId, selectedItemIds]
  )

  const clearSelection = useCallback(() => {
    setSelectedItemIds([])
  }, [setSelectedItemIds])

  const replaceSelection = useCallback(
    (itemIds: Array<string>) => {
      setSelectedItemIds(itemIds)
    },
    [setSelectedItemIds]
  )

  const toggleFavorite = useCallback(
    (itemId: string) => {
      const item = fullTree.items.get(itemId)
      toggleSharedFavorite(itemId, { disabled: item?.kind === "folder" })
    },
    [fullTree.items, toggleSharedFavorite]
  )

  const vmIdMap = useMemo(() => buildVmIdMap(fullTree.items), [fullTree.items])

  const getStatus = useCallback(
    (itemId: string): string | undefined => {
      if (!vmStatuses) return undefined
      const vmid = vmIdMap.get(itemId)
      if (vmid === undefined) return undefined
      return vmStatuses[vmid]
    },
    [vmStatuses, vmIdMap]
  )

  const getItemData = useCallback(
    (itemId: string) => fullTree.items.get(itemId),
    [fullTree.items]
  )

  const handleMove = useCallback(
    (itemIds: Array<string>, parentId: string) => {
      moveItems.mutate(
        { itemIds, parentId },
        {
          onError: (moveError) => {
            toast.error(formatToastError(moveError, "Move failed"))
          },
        }
      )
    },
    [moveItems]
  )

  const handlePrimaryAction = useCallback(
    (itemId: string, data: ApiTreeNode) => {
      if (data.kind !== "vm") return
      navigate({ to: "/inventory/items/$itemId", params: { itemId } })
    },
    [navigate]
  )

  const handleFavoritePrimaryAction = useCallback(
    (itemId: string, data: ApiTreeNode) => {
      setQuery("")
      setPendingRevealRequest((current) => ({
        itemId,
        requestId: current ? current.requestId + 1 : 1,
      }))
      handlePrimaryAction(itemId, data)
    },
    [handlePrimaryAction]
  )

  const handleRevealComplete = useCallback((requestId: number) => {
    setPendingRevealRequest((current) =>
      current?.requestId === requestId ? null : current
    )
  }, [])

  const { tree, expandAll, collapseAll } = useInventoryHeadlessTree({
    children: treeChildren,
    items,
    folderIds,
    parentIds,
    onMove: handleMove,
    onPrimaryAction: handlePrimaryAction,
    pendingRevealRequest,
    onRevealComplete: handleRevealComplete,
    selectedItemIds,
    setSelectedItemIds,
  })

  const value: InventoryTreeContextValue = {
    query,
    setQuery,
    resultCount,
    tree,
    expandAll,
    collapseAll,
    getStatus,
    isLoading,
    error: error,
    isEmpty: !isLoading && apiTree.length === 0,
    favoriteIds,
    toggleFavorite,
    getItemData,
    handlePrimaryAction,
    handleFavoritePrimaryAction,
    selectedItemIds,
    replaceSelection,
    clearSelection,
  }

  return <InventoryTreeContext value={value}>{children}</InventoryTreeContext>
}

export function InventoryTreeHeader() {
  const {
    query,
    setQuery,
    resultCount,
    expandAll,
    collapseAll,
    isLoading,
    favoriteIds,
  } = useInventoryTreeContext()

  return (
    <>
      <SidebarGroupLabel className="-ml-1">Inventory</SidebarGroupLabel>
      <div className="absolute top-3 right-3 flex">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={expandAll}
                disabled={isLoading}
              >
                <IconChevronDown />
              </Button>
            }
          />
          <TooltipContent>
            <p>Expand all</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={collapseAll}
                disabled={isLoading}
              >
                <IconChevronUp />
              </Button>
            }
          />
          <TooltipContent>
            <p>Collapse all</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <InventoryTreeSearch
        query={query}
        resultCount={resultCount}
        setQuery={setQuery}
      />
      <AnimatePresence initial={false}>
        {favoriteIds.size > 0 && <InventoryFavoritesSection />}
      </AnimatePresence>
    </>
  )
}

interface FlatTree {
  items: Map<string, ApiTreeNode>
  children: Map<string, Array<string>>
  folderIds: Array<string>
  parentIds: Map<string, string>
}

function flattenApiTree(roots: Array<ApiTreeNode>): FlatTree {
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
    if (node.kind === "folder") {
      count += countLeaves(node.children ?? [])
    } else {
      count++
    }
  }

  return count
}

function buildVmIdMap(items: Map<string, ApiTreeNode>): Map<string, number> {
  const map = new Map<string, number>()

  for (const [id, node] of items) {
    if (node.kind === "vm" && node.vm?.vmid !== undefined) {
      map.set(id, node.vm.vmid)
    }
  }

  return map
}

export function InventoryTreeBody() {
  const { tree, getStatus, isLoading, error, isEmpty } =
    useInventoryTreeContext()

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
    )
  }

  if (isEmpty) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">
        No inventory items
      </div>
    )
  }

  if (isLoading) {
    return <SidebarListSkeleton />
  }

  return (
    <div className="flex flex-col gap-1 pt-1">
      <InventoryTreeContent tree={tree} getStatus={getStatus} />
      <InventorySelectionActionBar />
    </div>
  )
}
