import {
  InventoryTreeDataContext,
  InventoryTreeNavigationContext,
  InventoryTreeViewContext,
} from "../../../lib/inventory/tree/inventory-tree-context"
import {
  buildVmIdMap,
  flattenApiTree,
} from "@/lib/inventory/tree/inventory-tree-data"
import { useCallback, useMemo, useState } from "react"
import {
  useInventoryTreeMove,
  useInventoryTreePrimaryAction,
  useInventoryTreeRevealNavigation,
  useInventoryTreeSelection,
} from "@/hooks/inventory/tree/use-inventory-tree-state"
import type { ReactNode } from "react"
import { buildFolderCanPowerMap } from "@/lib/inventory/actions/inventory-power-actions"
import { filterInventoryTreeByName } from "../../../lib/inventory/inventory-tree"
import { inventoryTreeFixtureVmCount } from "../../../lib/inventory/dev/inventory-tree-fixture-config"
import { inventoryTreeQueryOptions } from "../../../lib/inventory/inventory-api"
import { useInventoryFavorites } from "../../../hooks/inventory/use-inventory-favorites"
import { useInventoryHeadlessTree } from "../../../hooks/inventory/tree/use-inventory-headless-tree"
import { useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { vmStatusQueryOptions } from "@/lib/vms/vm-api"

const NO_SEARCH_EXPANDED_ITEMS: Array<string> = []
const INVENTORY_SEARCH_MIN_LENGTH = 2

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const activeItemId = useParams({ strict: false }).itemId
  const { favoriteIds, toggleFavorite: toggleSharedFavorite } =
    useInventoryFavorites()

  const [searchQuery, setSearchQuery] = useState("")
  const normalizedSearchQuery = searchQuery.trim()
  const isSearchActive =
    normalizedSearchQuery.length >= INVENTORY_SEARCH_MIN_LENGTH

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

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

  const { clearSelection, selectedItemIds, setSelectedItemIds } =
    useInventoryTreeSelection(activeItemId, sourceItems)

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
  const canPowerByFolderId = useMemo(
    () => buildFolderCanPowerMap(apiTree),
    [apiTree]
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

  const handleMove = useInventoryTreeMove(sourceItems)
  const { handlePrimaryAction, treeNavigationItemIdRef } =
    useInventoryTreePrimaryAction()

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
  const expandedItemIds = tree.getState().expandedItems

  const revealAndNavigateToItem = useInventoryTreeRevealNavigation({
    activeItemId,
    displayItems,
    handlePrimaryAction,
    isSearchActive,
    revealItem,
    searchQuery,
    setSearchQuery,
    sourceItems,
    treeNavigationItemIdRef,
  })

  const searchResultCount = !isLoading && !error ? filterResult.matchCount : 0
  const queryError = error ?? null

  const dataValue = useMemo(
    () => ({
      canPowerByFolderId,
      getStatus,
      isLoading,
      error: queryError,
      isEmpty: !isLoading && apiTree.length === 0,
      getItemData,
    }),
    [
      apiTree.length,
      canPowerByFolderId,
      getItemData,
      getStatus,
      isLoading,
      queryError,
    ]
  )

  const viewValue = useMemo(
    () => ({
      tree,
      expandedItemIds,
      expandAll,
      collapseAll,
      searchQuery,
      setSearchQuery,
      isSearchActive,
      searchResultCount,
      favoriteIds,
      toggleFavorite,
      selectedItemIds,
      replaceSelection: setSelectedItemIds,
      clearSelection,
      scrollToItemHandlerRef,
    }),
    [
      clearSelection,
      collapseAll,
      expandedItemIds,
      expandAll,
      favoriteIds,
      isSearchActive,
      scrollToItemHandlerRef,
      searchQuery,
      searchResultCount,
      selectedItemIds,
      setSelectedItemIds,
      toggleFavorite,
      tree,
    ]
  )

  const navigationValue = useMemo(
    () => ({
      handlePrimaryAction,
      revealAndNavigateToItem,
    }),
    [handlePrimaryAction, revealAndNavigateToItem]
  )

  return (
    <InventoryTreeDataContext value={dataValue}>
      <InventoryTreeViewContext value={viewValue}>
        <InventoryTreeNavigationContext value={navigationValue}>
          {children}
          {!isLoading && !error && apiTree.length === 0 ? (
            <span className="sr-only" role="status" aria-live="polite">
              No items in inventory
            </span>
          ) : null}
        </InventoryTreeNavigationContext>
      </InventoryTreeViewContext>
    </InventoryTreeDataContext>
  )
}
