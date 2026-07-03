import { useCallback, useLayoutEffect, useRef, useState } from "react"
import {
  dragAndDropFeature,
  expandAllFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { toast } from "sonner"
import { TREE_INDENT, VIRTUAL_ROOT } from "../utils/constants"
import type {
  DragTarget,
  ItemInstance,
  TreeInstance,
} from "@headless-tree/core"
import type { ApiTreeNode } from "../types/inventory-types"
import { formatToastError } from "@/features/shared/utils/format"

interface UseInventoryHeadlessTreeOptions {
  children: Map<string, Array<string>>
  items: Map<string, ApiTreeNode>
  folderIds: Array<string>
  parentIds: Map<string, string>
  onMove: (itemIds: Array<string>, parentId: string) => void
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
  selectedItemIds: Array<string>
  setSelectedItemIds: (
    updater: Array<string> | ((prev: Array<string>) => Array<string>)
  ) => void
}

interface SelectionDataRef {
  selectUpToAnchorId?: string | null
}

const STORAGE_KEY = "kamino-inventory-expanded"

function folderIdsKey(folderIds: Array<string>) {
  return folderIds.join("\0")
}

function updateExpandedItems(
  tree: TreeInstance<ApiTreeNode>,
  nextExpandedItems: Array<string>
) {
  tree.applySubStateUpdate("expandedItems", nextExpandedItems)
  tree.rebuildTree()
}

function getTopLevelDraggedItemIds(
  draggedItems: Array<ItemInstance<ApiTreeNode>>
): Array<string> {
  const topLevelIds: Array<string> = []

  for (const draggedItem of draggedItems) {
    const isNested = draggedItems.some(
      (candidate) =>
        candidate.getId() !== draggedItem.getId() &&
        draggedItem.isDescendentOf(candidate.getId())
    )

    if (!isNested) {
      topLevelIds.push(draggedItem.getId())
    }
  }

  return topLevelIds
}

export function useInventoryHeadlessTree({
  children,
  items,
  folderIds,
  parentIds,
  onMove,
  onPrimaryAction,
  selectedItemIds,
  setSelectedItemIds,
}: UseInventoryHeadlessTreeOptions) {
  const itemsRef = useRef(items)
  const childrenRef = useRef(children)
  const scrollToItemHandlerRef = useRef<((itemId: string) => void) | null>(null)
  itemsRef.current = items
  childrenRef.current = children

  const [expandedItems, setExpandedItems] = useState<Array<string>>(() => {
    if (typeof window === "undefined") return []
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return folderIds
      }
    }
    return folderIds
  })

  const handleExpandedChange = useCallback(
    (updater: Array<string> | ((prev: Array<string>) => Array<string>)) => {
      setExpandedItems((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    []
  )

  const handleDrop = useCallback(
    (
      draggedItems: Array<ItemInstance<ApiTreeNode>>,
      target: DragTarget<ApiTreeNode>
    ) => {
      const targetParentId = target.item.getId()
      const draggedIds = getTopLevelDraggedItemIds(draggedItems).filter(
        (draggedId) => parentIds.get(draggedId) !== targetParentId
      )

      if (draggedIds.length === 0) {
        return
      }

      onMove(draggedIds, targetParentId)
    },
    [onMove, parentIds]
  )

  const tree = useTree<ApiTreeNode>({
    rootItemId: VIRTUAL_ROOT.id,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind === "folder",
    dataLoader: {
      getItem: (itemId) => itemsRef.current.get(itemId) ?? VIRTUAL_ROOT,
      getChildren: (itemId) => childrenRef.current.get(itemId) ?? [],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      expandAllFeature,
    ],
    indent: TREE_INDENT,
    canReorder: false,
    canDrag: (draggedItems) => draggedItems.length > 0,
    canDrop: (_items, target) => {
      const data = target.item.getItemData()
      return data.kind === "folder"
    },
    onDrop: (draggedItems, target) => {
      try {
        handleDrop(draggedItems, target)
      } catch (error) {
        toast.error(formatToastError(error, "Move failed"))
      }
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData()
      onPrimaryAction(item.getId(), data)
    },
    scrollToItem: (item) => {
      scrollToItemHandlerRef.current?.(item.getId())
    },
    state: {
      expandedItems,
      selectedItems: selectedItemIds,
    },
    setExpandedItems: (updater) => {
      handleExpandedChange(updater)
    },
    setSelectedItems: (updater) => {
      setSelectedItemIds((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      )
    },
  })

  const childrenKeyRef = useRef("")
  useLayoutEffect(() => {
    const key = JSON.stringify([...children.entries()])
    if (key === childrenKeyRef.current) {
      return
    }

    childrenKeyRef.current = key
    tree.rebuildTree()
  }, [children, tree])

  const appliedDefaultFolderIdsRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (typeof window === "undefined") return

    const nextKey = folderIdsKey(folderIds)
    if (
      folderIds.length === 0 ||
      localStorage.getItem(STORAGE_KEY) ||
      appliedDefaultFolderIdsRef.current === nextKey
    ) {
      return
    }

    appliedDefaultFolderIdsRef.current = nextKey
    updateExpandedItems(tree, folderIds)
  }, [folderIds, tree])

  const selectionDataRef = tree.getDataRef<SelectionDataRef>()
  const anchorId = selectionDataRef.current.selectUpToAnchorId

  if (anchorId && !items.has(anchorId)) {
    selectionDataRef.current.selectUpToAnchorId = null
  } else if (selectedItemIds.length === 0) {
    selectionDataRef.current.selectUpToAnchorId = null
  } else if (
    selectedItemIds.length === 1 &&
    items.has(selectedItemIds[0]) &&
    anchorId !== selectedItemIds[0]
  ) {
    selectionDataRef.current.selectUpToAnchorId = selectedItemIds[0]
  }

  const expandAll = useCallback(() => {
    updateExpandedItems(tree, folderIds)
  }, [folderIds, tree])

  const collapseAll = useCallback(() => {
    updateExpandedItems(tree, [])
  }, [tree])

  const revealItem = useCallback(
    async (itemId: string) => {
      if (!items.has(itemId)) return

      const ancestorIds: Array<string> = []
      let parentId = parentIds.get(itemId)

      while (parentId && parentId !== VIRTUAL_ROOT.id) {
        ancestorIds.unshift(parentId)
        parentId = parentIds.get(parentId)
      }

      for (const ancestorId of ancestorIds) {
        const ancestor = tree.getItemInstance(ancestorId)
        if (!ancestor.isExpanded()) {
          ancestor.expand()
        }
      }

      for (let attempt = 0; attempt < 20; attempt++) {
        if (tree.getItems().some((item) => item.getId() === itemId)) {
          break
        }

        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      if (scrollToItemHandlerRef.current) {
        scrollToItemHandlerRef.current(itemId)
        return
      }

      await tree
        .getItemInstance(itemId)
        .scrollTo({ block: "center", inline: "nearest" })
    },
    [items, parentIds, tree]
  )

  return { tree, expandAll, collapseAll, revealItem, scrollToItemHandlerRef }
}
