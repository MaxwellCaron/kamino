import {
  INVENTORY_TREE_ROW_GAP,
  INVENTORY_TREE_ROW_HEIGHT,
} from "@/lib/inventory/constants"
import { Tree, TreeDragLine } from "@workspace/ui/components/reui/tree"
import {
  computeRowGuideContinues,
  createTreeRangeExtractor,
  upsertRowVm,
} from "../../../lib/inventory/tree/tree-content-utils"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  useInventoryTreeDataContext,
  useInventoryTreeNavigationContext,
  useInventoryTreeViewContext,
} from "@/hooks/inventory/tree/use-inventory-tree-context"
import type { ApiTreeNode } from "../../../lib/inventory/inventory-types"
import { InventoryTreeRow } from "./inventory-tree-row"
import type { InventoryTreeRowVm } from "../../../lib/inventory/tree/tree-content-utils"
import { TREE_INDENT } from "../../../lib/inventory/constants"
import type { TreeInstance } from "@headless-tree/core"
import { hasNodeActions } from "../../../lib/inventory/inventory-capabilities"
import { useInventoryTreeDragAutoscroll } from "../../../hooks/inventory/tree/use-inventory-tree-drag-autoscroll"
import { useVirtualizer } from "@tanstack/react-virtual"

const TREE_ROW_OVERSCAN = 8
const TREE_ROW_CONTENT_HEIGHT =
  INVENTORY_TREE_ROW_HEIGHT - INVENTORY_TREE_ROW_GAP

export function InventoryTreeContent({
  getStatus,
  tree,
}: {
  getStatus: (itemId: string) => string | undefined
  tree: TreeInstance<ApiTreeNode>
}) {
  const { canPowerByFolderId } = useInventoryTreeDataContext()
  const { favoriteIds, toggleFavorite, scrollToItemHandlerRef } =
    useInventoryTreeViewContext()
  const { handlePrimaryAction } = useInventoryTreeNavigationContext()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const rowVmCacheRef = useRef<Map<string, InventoryTreeRowVm> | null>(null)
  if (rowVmCacheRef.current === null) {
    rowVmCacheRef.current = new Map()
  }
  const rowVmCache = rowVmCacheRef.current
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useInventoryTreeDragAutoscroll(scrollElement, tree)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const scroller =
      wrapper?.closest<HTMLElement>(
        '[data-slot="tree-scroll-container"], [data-slot="scroll-area-viewport"], [data-slot="sidebar-content"]'
      ) ?? null

    setScrollElement(scroller)

    if (wrapper && scroller) {
      setScrollMargin(
        wrapper.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
      )
    }
  }, [])

  const items = tree.getItems()

  const getItemKey = useCallback(
    (index: number) => items[index]?.getId() ?? index,
    [items]
  )

  const focusedItemId = tree.getState().focusedItem
  const focusedIndex = focusedItemId
    ? items.findIndex((item) => item.getId() === focusedItemId)
    : -1
  const rangeExtractor = useMemo(
    () => createTreeRangeExtractor(focusedIndex),
    [focusedIndex]
  )

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => TREE_ROW_CONTENT_HEIGHT,
    gap: INVENTORY_TREE_ROW_GAP,
    overscan: TREE_ROW_OVERSCAN,
    getItemKey,
    scrollMargin,
    rangeExtractor,
    useFlushSync: false,
  })

  const pendingScrollItemId = useRef<string | null>(null)

  const scrollToPendingItem = useCallback(() => {
    if (!pendingScrollItemId.current || !scrollElement) return

    const index = items.findIndex(
      (item) => item.getId() === pendingScrollItemId.current
    )
    if (index < 0) return

    const [targetOffset] = virtualizer.getOffsetForIndex(index, "auto") ?? [
      null,
    ]
    if (targetOffset === null) return

    const distance = Math.abs(targetOffset - (virtualizer.scrollOffset ?? 0))
    const viewportHeight = virtualizer.scrollRect?.height ?? 0
    const behavior = distance <= viewportHeight * 3 ? "smooth" : "auto"

    virtualizer.scrollToIndex(index, { align: "auto", behavior })
    pendingScrollItemId.current = null
  }, [items, scrollElement, virtualizer])

  useLayoutEffect(() => {
    scrollToItemHandlerRef.current = (itemId) => {
      pendingScrollItemId.current = itemId
      scrollToPendingItem()
    }
    scrollToPendingItem()
    return () => {
      scrollToItemHandlerRef.current = null
    }
  }, [scrollToItemHandlerRef, scrollToPendingItem])

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={wrapperRef} style={{ height: virtualizer.getTotalSize() }}>
      <Tree tree={tree} indent={TREE_INDENT} className="relative h-full">
        {virtualRows.map((virtualRow) => {
          const item = items.at(virtualRow.index)
          if (!item) return null

          const id = item.getId()
          const data = item.getItemData()
          const canPower = canPowerByFolderId.get(id) ?? false
          const vm = upsertRowVm(rowVmCache, {
            id,
            name: item.getItemName(),
            kind: data.kind,
            level: item.getItemMeta().level,
            isFolder: data.kind === "folder",
            isExpanded: item.isExpanded(),
            isSelected: item.isSelected(),
            isFocused: item.isFocused(),
            isDragTarget: item.isDragTarget(),
            isSearchMatch:
              typeof item.isMatchingSearch === "function"
                ? item.isMatchingSearch() || false
                : false,
            isFavorite: favoriteIds.has(id),
            status: getStatus(id),
            vmCount: data.vm_count ?? null,
            vmLimit: data.effective_vm_limit ?? null,
            canPower,
            hasActions: hasNodeActions(data, canPower),
            hasChildren: item.getChildren().length > 0,
            guideContinues: computeRowGuideContinues(item),
          })

          return (
            <div
              key={virtualRow.key}
              className="absolute top-0 left-0 flex w-full flex-col"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <InventoryTreeRow
                vm={vm}
                data={data}
                item={item}
                tree={tree}
                onPrimaryAction={handlePrimaryAction}
                onToggleFavorite={toggleFavorite}
              />
            </div>
          )
        })}
        <TreeDragLine />
      </Tree>
    </div>
  )
}
