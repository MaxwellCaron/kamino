import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ApiTreeNode } from "@/lib/inventory/inventory-types"
import type { RefObject } from "react"
import type { SelectionState } from "@/lib/inventory/tree/inventory-tree-data"
import { formatToastError } from "@/lib/format"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useMoveInventoryItems } from "@/hooks/inventory/use-inventory-actions"
import { useNavigate } from "@tanstack/react-router"

export function useInventoryTreeSelection(
  activeItemId: string | undefined,
  sourceItems: Map<string, ApiTreeNode>
) {
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null
  )

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

  return { clearSelection, selectedItemIds, setSelectedItemIds }
}

export function useInventoryTreeMove(sourceItems: Map<string, ApiTreeNode>) {
  const moveItems = useMoveInventoryItems()

  const runMove = useCallback(
    async (ids: Array<string>, parentId: string) => {
      try {
        await moveItems.mutateAsync({ itemIds: ids, parentId })
      } catch (moveError) {
        throw new Error(formatToastError(moveError, "Move failed"))
      }
    },
    [moveItems]
  )

  return useCallback(
    (itemIds: Array<string>, parentId: string) => {
      showUnitMutationToast({
        title: "Moving inventory items",
        units: [
          {
            items: itemIds.map((itemId) => ({
              id: itemId,
              name: sourceItems.get(itemId)?.name ?? itemId,
              successDescription: "Moved",
              retry: () => runMove([itemId], parentId),
            })),
            run: () => runMove(itemIds, parentId),
          },
        ],
      })
    },
    [runMove, sourceItems]
  )
}

export function useInventoryTreePrimaryAction() {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const treeNavigationItemIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    navigateRef.current = navigate
  })

  const handlePrimaryAction = useCallback((itemId: string) => {
    treeNavigationItemIdRef.current = itemId
    navigateRef.current({ to: "/inventory/items/$itemId", params: { itemId } })
  }, [])

  return { handlePrimaryAction, treeNavigationItemIdRef }
}

export function useInventoryTreeRevealNavigation({
  activeItemId,
  displayItems,
  handlePrimaryAction,
  isSearchActive,
  revealItem,
  searchQuery,
  setSearchQuery,
  sourceItems,
  treeNavigationItemIdRef,
}: {
  activeItemId: string | undefined
  displayItems: Map<string, ApiTreeNode>
  handlePrimaryAction: (itemId: string) => void
  isSearchActive: boolean
  revealItem: (itemId: string) => Promise<void>
  searchQuery: string
  setSearchQuery: (query: string) => void
  sourceItems: Map<string, ApiTreeNode>
  treeNavigationItemIdRef: RefObject<string | null>
}) {
  const pendingRevealItemIdRef = useRef<string | null>(null)
  const revealedRouteItemIdRef = useRef<string | null>(null)
  const isSearchActiveRef = useRef(isSearchActive)
  const displayItemsRef = useRef(displayItems)
  const revealItemRef = useRef(revealItem)

  useLayoutEffect(() => {
    isSearchActiveRef.current = isSearchActive
    displayItemsRef.current = displayItems
    revealItemRef.current = revealItem
  })

  const revealAndNavigateToItem = useCallback(
    (itemId: string) => {
      if (isSearchActiveRef.current && !displayItemsRef.current.has(itemId)) {
        pendingRevealItemIdRef.current = itemId
        setSearchQuery("")
        return
      }

      void revealItemRef.current(itemId)
      handlePrimaryAction(itemId)
    },
    [handlePrimaryAction, setSearchQuery]
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
  }, [
    activeItemId,
    isSearchActive,
    revealItem,
    setSearchQuery,
    treeHasActiveItem,
    treeNavigationItemIdRef,
  ])

  useEffect(() => {
    const pendingItemId = pendingRevealItemIdRef.current
    if (!pendingItemId || isSearchActive) {
      return
    }

    pendingRevealItemIdRef.current = null
    void revealItem(pendingItemId)
    handlePrimaryAction(pendingItemId)
  }, [handlePrimaryAction, isSearchActive, revealItem, searchQuery])

  return revealAndNavigateToItem
}
