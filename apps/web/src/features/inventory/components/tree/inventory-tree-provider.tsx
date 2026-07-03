import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"

import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { useMoveInventoryItems } from "../../hooks/use-inventory-actions"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useInventoryHeadlessTree } from "../../hooks/use-inventory-headless-tree"
import { VIRTUAL_ROOT } from "../../utils/constants"
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

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null
  )
  const { favoriteIds, toggleFavorite: toggleSharedFavorite } =
    useInventoryFavorites()

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItems = useMoveInventoryItems()

  const fullTree = useMemo(() => flattenApiTree(apiTree), [apiTree])

  const {
    items,
    children: treeChildren,
    folderIds,
    parentIds,
  } = fullTree

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
      toggleSharedFavorite(itemId)
    },
    [toggleSharedFavorite]
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
    (itemId: string) => {
      navigate({ to: "/inventory/items/$itemId", params: { itemId } })
    },
    [navigate]
  )

  const {
    tree,
    expandAll,
    collapseAll,
    revealItem,
    scrollToItemHandlerRef,
  } = useInventoryHeadlessTree({
    children: treeChildren,
    items,
    folderIds,
    parentIds,
    onMove: handleMove,
    onPrimaryAction: handlePrimaryAction,
    selectedItemIds,
    setSelectedItemIds,
  })

  const handleFavoritePrimaryAction = useCallback(
    (itemId: string) => {
      void revealItem(itemId)
      handlePrimaryAction(itemId)
    },
    [handlePrimaryAction, revealItem]
  )

  const lastAutoRevealedItemIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeItemId || !items.has(activeItemId)) {
      lastAutoRevealedItemIdRef.current = null
      return
    }

    const activeItem = fullTree.items.get(activeItemId)
    if (activeItem?.kind !== "vm") {
      return
    }

    if (lastAutoRevealedItemIdRef.current === activeItemId) {
      return
    }

    lastAutoRevealedItemIdRef.current = activeItemId
    void revealItem(activeItemId)
  }, [activeItemId, fullTree.items, items, revealItem])

  const value: InventoryTreeContextValue = {
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
