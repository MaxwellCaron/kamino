import { useCallback, useEffect, useRef, useState } from "react"
import {
  dragAndDropFeature,
  expandAllFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { toast } from "sonner"
import { TREE_INDENT, VIRTUAL_ROOT } from "./constants"
import type { DragTarget, ItemInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "@/lib/queries"

interface UseInventoryHeadlessTreeOptions {
  activeItemId?: string
  children: Map<string, Array<string>>
  items: Map<string, ApiTreeNode>
  folderIds: Array<string>
  onMove: (itemId: string, parentId: string) => void
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
}

const STORAGE_KEY = "kamino-inventory-expanded"

export function useInventoryHeadlessTree({
  activeItemId,
  children,
  items,
  folderIds,
  onMove,
  onPrimaryAction,
}: UseInventoryHeadlessTreeOptions) {
  const itemsRef = useRef(items)
  const childrenRef = useRef(children)
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved && folderIds.length > 0) {
      setExpandedItems(folderIds)
    }
  }, [folderIds])

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
      const draggedItem = draggedItems[0]
      const draggedId = draggedItem.getId()
      const targetParentId = target.item.getId()

      if (
        draggedItem.getItemData().kind === "vm" &&
        draggedItem.getParent()?.getId() === targetParentId
      ) {
        return
      }

      onMove(draggedId, targetParentId)
    },
    [onMove]
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
    canDrop: (_items, target) => {
      const data = target.item.getItemData()
      return data.kind === "folder"
    },
    onDrop: (draggedItems, target) => {
      try {
        handleDrop(draggedItems, target)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Move failed")
      }
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData()
      onPrimaryAction(item.getId(), data)
    },
    state: {
      expandedItems,
      selectedItems: activeItemId ? [activeItemId] : [],
    },
    setExpandedItems: (updater) => {
      handleExpandedChange(updater)
    },
  })

  const flatKeyRef = useRef("")
  useEffect(() => {
    const key = JSON.stringify([...children.entries()])
    if (key !== flatKeyRef.current) {
      flatKeyRef.current = key
      tree.rebuildTree()
    }
  }, [children, tree])

  const expandAll = useCallback(() => {
    handleExpandedChange(folderIds)
  }, [folderIds, handleExpandedChange])

  const collapseAll = useCallback(() => {
    handleExpandedChange([])
  }, [handleExpandedChange])

  return { tree, expandAll, collapseAll }
}
