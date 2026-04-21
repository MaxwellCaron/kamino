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
import type {
  DragTarget,
  ItemInstance,
  TreeInstance,
} from "@headless-tree/core"
import type { ApiTreeNode } from "@/lib/queries"

interface UseInventoryHeadlessTreeOptions {
  children: Map<string, Array<string>>
  items: Map<string, ApiTreeNode>
  folderIds: Array<string>
  parentIds: Map<string, string>
  onMove: (itemId: string, parentId: string) => void
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
  pendingRevealRequest: { itemId: string; requestId: number } | null
  onRevealComplete: (requestId: number) => void
  selectedItemIds: Array<string>
  setSelectedItemIds: (
    updater: Array<string> | ((prev: Array<string>) => Array<string>)
  ) => void
}

interface SelectionDataRef {
  selectUpToAnchorId?: string | null
}

const STORAGE_KEY = "kamino-inventory-expanded"

function updateExpandedItems(
  tree: TreeInstance<ApiTreeNode>,
  nextExpandedItems: Array<string>
) {
  tree.applySubStateUpdate("expandedItems", nextExpandedItems)
  tree.rebuildTree()
}

export function useInventoryHeadlessTree({
  children,
  items,
  folderIds,
  parentIds,
  onMove,
  onPrimaryAction,
  pendingRevealRequest,
  onRevealComplete,
  selectedItemIds,
  setSelectedItemIds,
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
    canDrag: (draggedItems) => draggedItems.length === 1,
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

  const flatKeyRef = useRef("")
  useEffect(() => {
    const key = JSON.stringify([...children.entries()])
    if (key !== flatKeyRef.current) {
      flatKeyRef.current = key
      tree.rebuildTree()
    }
  }, [children, tree])

  useEffect(() => {
    const dataRef = tree.getDataRef<SelectionDataRef>()
    const anchorId = dataRef.current.selectUpToAnchorId

    if (anchorId && !items.has(anchorId)) {
      dataRef.current.selectUpToAnchorId = null
    }

    if (selectedItemIds.length === 0) {
      dataRef.current.selectUpToAnchorId = null
      return
    }

    if (selectedItemIds.length === 1 && items.has(selectedItemIds[0])) {
      dataRef.current.selectUpToAnchorId = selectedItemIds[0]
    }
  }, [items, selectedItemIds, tree])

  useEffect(() => {
    if (typeof window === "undefined") return

    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved && folderIds.length > 0) {
      updateExpandedItems(tree, folderIds)
    }
  }, [folderIds, tree])

  const expandAll = useCallback(() => {
    updateExpandedItems(tree, folderIds)
  }, [folderIds, tree])

  const collapseAll = useCallback(() => {
    updateExpandedItems(tree, [])
  }, [tree])

  useEffect(() => {
    if (!pendingRevealRequest) return

    const { itemId, requestId } = pendingRevealRequest
    if (!items.has(itemId)) return

    let canceled = false

    async function revealItem() {
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

      await tree
        .getItemInstance(itemId)
        .scrollTo({ block: "center", inline: "nearest" })

      if (!canceled) {
        onRevealComplete(requestId)
      }
    }

    void revealItem()

    return () => {
      canceled = true
    }
  }, [items, onRevealComplete, parentIds, pendingRevealRequest, tree])

  return { tree, expandAll, collapseAll }
}
