import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"

import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { inventoryTreeFixtureVmCount } from "../../dev/inventory-tree-fixture-config"
import { useMoveInventoryItems } from "../../hooks/use-inventory-actions"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useInventoryHeadlessTree } from "../../hooks/use-inventory-headless-tree"
import { VIRTUAL_ROOT } from "../../utils/constants"
import { filterInventoryTreeByName } from "../../utils/inventory-tree"
import { InventoryTreeContext } from "./inventory-tree-context"
import type { ReactNode } from "react"
import type { InventoryTreeContextValue } from "./inventory-tree-context"
import type { ApiTreeNode } from "../../types/inventory-types"
import { formatToastError } from "@/features/shared/utils/format"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

interface SelectionState {
  activeItemId?: string
  itemIds: Array<string>
}

const NO_SEARCH_EXPANDED_ITEMS: Array<string> = []
const INVENTORY_SEARCH_MIN_LENGTH = 2

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null
  )
  const { favoriteIds, toggleFavorite: toggleSharedFavorite } =
    useInventoryFavorites()

  const [searchQuery, setSearchQuery] = useState("")
  const pendingRevealItemIdRef = useRef<string | null>(null)
  const treeNavigationItemIdRef = useRef<string | null>(null)
  const revealedRouteItemIdRef = useRef<string | null>(null)
  const normalizedSearchQuery = searchQuery.trim()
  const isSearchActive =
    normalizedSearchQuery.length >= INVENTORY_SEARCH_MIN_LENGTH

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItems = useMoveInventoryItems()

  const filterResult = useMemo(
    () =>
      filterInventoryTreeByName(
        apiTree,
        isSearchActive ? normalizedSearchQuery : ""
      ),
    [apiTree, isSearchActive, normalizedSearchQuery]
  )

  const sourceTree = useMemo(() => flattenApiTree(apiTree), [apiTree])
  const displayTree = useMemo(
    () => flattenApiTree(filterResult.filteredTree),
    [filterResult.filteredTree]
  )

  const { items: sourceItems, folderIds: sourceFolderIds } = sourceTree

  const {
    items: displayItems,
    children: displayChildren,
    parentIds: displayParentIds,
  } = displayTree

  const selectedItemIds = useMemo(() => {
    const itemIdsForActiveRoute =
      activeItemId === undefined ? [] : [activeItemId]
    const itemIds =
      selectionState?.activeItemId === activeItemId
        ? (selectionState?.itemIds ?? [])
        : itemIdsForActiveRoute

    return itemIds.filter(
      (itemId) => itemId === activeItemId || sourceItems.has(itemId)
    )
  }, [activeItemId, sourceItems, selectionState])

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

  const toggleFavorite = useCallback(
    (itemId: string) => {
      toggleSharedFavorite(itemId)
    },
    [toggleSharedFavorite]
  )

  const vmIdMap = useMemo(
    () => buildVmIdMap(sourceTree.items),
    [sourceTree.items]
  )

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
    (itemId: string) => sourceTree.items.get(itemId),
    [sourceTree.items]
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
    (itemId: string) => {
      treeNavigationItemIdRef.current = itemId
      navigate({ to: "/inventory/items/$itemId", params: { itemId } })
    },
    [navigate]
  )

  const { tree, expandAll, collapseAll, revealItem, scrollToItemHandlerRef } =
    useInventoryHeadlessTree({
      children: displayChildren,
      items: displayItems,
      folderIds: sourceFolderIds,
      isReadOnly: import.meta.env.DEV && inventoryTreeFixtureVmCount !== null,
      isSearchActive,
      searchExpandedItemIds: isSearchActive
        ? filterResult.ancestorFolderIds
        : NO_SEARCH_EXPANDED_ITEMS,
      parentIds: displayParentIds,
      onMove: handleMove,
      onPrimaryAction: handlePrimaryAction,
      selectedItemIds,
      setSelectedItemIds,
    })

  const revealAndNavigateToItem = useCallback(
    (itemId: string) => {
      if (isSearchActive && !displayItems.has(itemId)) {
        pendingRevealItemIdRef.current = itemId
        setSearchQuery("")
        return
      }

      void revealItem(itemId)
      handlePrimaryAction(itemId)
    },
    [displayItems, handlePrimaryAction, isSearchActive, revealItem]
  )

  const treeHasActiveItem =
    activeItemId !== undefined && sourceItems.has(activeItemId)

  useLayoutEffect(() => {
    if (!activeItemId) {
      revealedRouteItemIdRef.current = null
      return
    }

    if (!treeHasActiveItem || revealedRouteItemIdRef.current === activeItemId) {
      return
    }

    revealedRouteItemIdRef.current = activeItemId
    const skipReveal = treeNavigationItemIdRef.current === activeItemId
    treeNavigationItemIdRef.current = null

    if (skipReveal) {
      return
    }

    if (isSearchActive) {
      pendingRevealItemIdRef.current = activeItemId
      setSearchQuery("")
      return
    }

    void revealItem(activeItemId)
  }, [activeItemId, isSearchActive, revealItem, treeHasActiveItem])

  useEffect(() => {
    const pendingItemId = pendingRevealItemIdRef.current
    if (!pendingItemId || isSearchActive) {
      return
    }

    pendingRevealItemIdRef.current = null
    void revealItem(pendingItemId)
    handlePrimaryAction(pendingItemId)
  }, [handlePrimaryAction, isSearchActive, revealItem, searchQuery])

  const searchResultCount = !isLoading && !error ? filterResult.matchCount : 0

  const value: InventoryTreeContextValue = {
    tree,
    expandAll,
    collapseAll,
    getStatus,
    isLoading,
    error: error,
    isEmpty: !isLoading && apiTree.length === 0,
    searchQuery,
    setSearchQuery,
    isSearchActive,
    searchResultCount,
    favoriteIds,
    toggleFavorite,
    getItemData,
    handlePrimaryAction,
    revealAndNavigateToItem,
    selectedItemIds,
    replaceSelection: setSelectedItemIds,
    clearSelection,
    scrollToItemHandlerRef,
  }

  return <InventoryTreeContext value={value}>{children}</InventoryTreeContext>
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
function buildVmIdMap(items: Map<string, ApiTreeNode>): Map<string, number> {
  const map = new Map<string, number>()

  for (const [id, node] of items) {
    if (node.kind === "vm" && node.vm?.vmid !== undefined) {
      map.set(id, node.vm.vmid)
    }
  }

  return map
}
