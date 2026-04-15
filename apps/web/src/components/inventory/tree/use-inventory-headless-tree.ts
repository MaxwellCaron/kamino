import { useCallback, useEffect, useRef } from "react"
import {
  dragAndDropFeature,
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
  folderIds: Array<string>
  isSearching: boolean
  items: Map<string, ApiTreeNode>
  onMove: (itemId: string, parentId: string) => void
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
}

export function useInventoryHeadlessTree({
  activeItemId,
  children,
  folderIds,
  isSearching,
  items,
  onMove,
  onPrimaryAction,
}: UseInventoryHeadlessTreeOptions) {
  const itemsRef = useRef(items)
  const childrenRef = useRef(children)
  itemsRef.current = items
  childrenRef.current = children

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
    features: [syncDataLoaderFeature, selectionFeature, dragAndDropFeature],
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
      selectedItems: activeItemId ? [activeItemId] : [],
      ...(isSearching ? { expandedItems: folderIds } : {}),
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

  return tree
}
