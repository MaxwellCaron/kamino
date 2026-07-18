import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Tree, TreeDragLine } from "@workspace/ui/components/reui/tree"
import { TREE_INDENT } from "../../utils/constants"
import { hasNodeActions } from "../../utils/inventory-capabilities"
import { useInventoryTreeContext } from "./inventory-tree-context"
import { InventoryTreeRow } from "./inventory-tree-row"
import {
  INVENTORY_TREE_ROW_GAP,
  INVENTORY_TREE_ROW_HEIGHT,
} from "./inventory-tree-row-skeleton"
import { createTreeRangeExtractor, upsertRowVm } from "./tree-content-utils"
import { useInventoryTreeDragAutoscroll } from "./use-inventory-tree-drag-autoscroll"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"
import type { InventoryTreeRowVm } from "./tree-content-utils"

const TREE_ROW_OVERSCAN = 50
const TREE_ROW_CONTENT_HEIGHT =
  INVENTORY_TREE_ROW_HEIGHT - INVENTORY_TREE_ROW_GAP

export function InventoryTreeContent({
  getStatus,
  tree,
}: {
  getStatus: (itemId: string) => string | undefined
  tree: TreeInstance<ApiTreeNode>
}) {
  const {
    canPowerByFolderId,
    favoriteIds,
    toggleFavorite,
    handlePrimaryAction,
    scrollToItemHandlerRef,
  } = useInventoryTreeContext()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const rowVmCacheRef = useRef(new Map<string, InventoryTreeRowVm>())
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
    directDomUpdates: true,
    useFlushSync: false,
  })

  useEffect(() => {
    scrollToItemHandlerRef.current = (itemId: string) => {
      let lastIndex = -1
      let stableFrames = 0

      const tick = (attempt: number) => {
        if (attempt > 30) return

        const index = tree
          .getItems()
          .findIndex((item) => item.getId() === itemId)

        if (index < 0 || !virtualizer.scrollElement) {
          requestAnimationFrame(() => tick(attempt + 1))
          return
        }

        if (index === lastIndex) {
          stableFrames += 1
        } else {
          lastIndex = index
          stableFrames = 0
        }

        // Wait until the tree has settled (expansion rebuilds finished) before scrolling.
        if (stableFrames < 2) {
          requestAnimationFrame(() => tick(attempt + 1))
          return
        }

        const [targetOffset] = virtualizer.getOffsetForIndex(index, "auto") ?? [
          null,
        ]
        if (targetOffset === null) return

        const distance = Math.abs(
          targetOffset - (virtualizer.scrollOffset ?? 0)
        )
        const viewportHeight = virtualizer.scrollRect?.height ?? 0
        // Uniform row heights: smooth scroll for nearby targets, instant for long jumps.
        const behavior = distance <= viewportHeight * 3 ? "smooth" : "auto"

        virtualizer.scrollToIndex(index, { align: "auto", behavior })
      }

      tick(0)
    }

    return () => {
      scrollToItemHandlerRef.current = null
    }
  }, [scrollToItemHandlerRef, tree, virtualizer])

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={wrapperRef}>
      <Tree
        ref={virtualizer.containerRef}
        tree={tree}
        indent={TREE_INDENT}
        className="relative"
      >
        {virtualRows.map((virtualRow) => {
          const item = items.at(virtualRow.index)
          if (!item) {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 flex w-full flex-col"
              />
            )
          }

          const id = item.getId()
          const data = item.getItemData()
          const canPower = canPowerByFolderId.get(id) ?? false
          const vm = upsertRowVm(rowVmCacheRef.current, {
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
          })

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 flex w-full flex-col"
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
