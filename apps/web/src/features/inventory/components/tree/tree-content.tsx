import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { HugeiconsIcon } from "@hugeicons/react"
import { StarIcon } from "@hugeicons/core-free-icons"
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
  TreeItemToggle,
} from "@workspace/ui/components/reui/tree"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { InventoryNodeMenu } from "../inventory-actions/inventory-node-menu"
import { InventoryNodeIcon } from "../inventory-node-icon"
import { TREE_INDENT } from "../../utils/constants"
import { useInventoryTreeContext } from "./inventory-tree-context"
import {
  INVENTORY_TREE_ROW_HEIGHT,
  InventoryTreeRowSkeleton,
} from "./inventory-tree-row-skeleton"
import type { MouseEvent as ReactMouseEvent } from "react"
import type { ItemInstance, TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

const TREE_ROW_OVERSCAN = 24
const TREE_ROW_ACTIVE_BUFFER = 6

interface SelectionDataRef {
  selectUpToAnchorId?: string | null
}

type TreeRowMouseEvent = ReactMouseEvent<HTMLElement, globalThis.MouseEvent> & {
  preventBaseUIHandler?: () => void
}

function hasSelectionModifier(event: TreeRowMouseEvent) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

function preventBaseTreeHandler(event: TreeRowMouseEvent) {
  event.preventBaseUIHandler?.()
}

function focusTreeItem(item: ItemInstance<ApiTreeNode>) {
  item.setFocused()
  item.getElement()?.focus({ preventScroll: true })
}

function toggleFolder(item: ItemInstance<ApiTreeNode>) {
  if (item.isExpanded()) {
    item.collapse()
    return
  }

  item.expand()
}

function applySelectionFromClick(
  event: TreeRowMouseEvent,
  item: ItemInstance<ApiTreeNode>,
  tree: TreeInstance<ApiTreeNode>
) {
  if (event.shiftKey) {
    item.selectUpTo(event.ctrlKey || event.metaKey)
  } else if (event.ctrlKey || event.metaKey) {
    item.toggleSelect()
  } else {
    tree.setSelectedItems([item.getId()])
  }

  if (!event.shiftKey) {
    tree.getDataRef<SelectionDataRef>().current.selectUpToAnchorId =
      item.getId()
  }

  focusTreeItem(item)
}

export function InventoryTreeContent({
  getStatus,
  tree,
}: {
  getStatus: (itemId: string) => string | undefined
  tree: TreeInstance<ApiTreeNode>
}) {
  const {
    favoriteIds,
    toggleFavorite,
    handlePrimaryAction,
    scrollToItemHandlerRef,
  } = useInventoryTreeContext()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

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

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => INVENTORY_TREE_ROW_HEIGHT,
    measureElement: () => INVENTORY_TREE_ROW_HEIGHT,
    overscan: TREE_ROW_OVERSCAN,
    getItemKey: (index) => items[index]?.getId() ?? index,
    scrollMargin,
    directDomUpdates: true,
    useFlushSync: false,
  })

  useEffect(() => {
    scrollToItemHandlerRef.current = (itemId: string) => {
      let settledOffset: number | null = null
      let stableFrames = 0

      const tick = (attempt: number) => {
        if (attempt > 30) return

        if (!virtualizer.scrollElement) {
          requestAnimationFrame(() => tick(attempt + 1))
          return
        }

        const index = tree
          .getItems()
          .findIndex((item) => item.getId() === itemId)
        const offsetInfo =
          index >= 0 ? virtualizer.getOffsetForIndex(index, "auto") : undefined

        if (!offsetInfo) {
          requestAnimationFrame(() => tick(attempt + 1))
          return
        }

        const [targetOffset] = offsetInfo
        if (targetOffset === (virtualizer.scrollOffset ?? 0)) return

        if (targetOffset === settledOffset) {
          stableFrames += 1
        } else {
          settledOffset = targetOffset
          stableFrames = 0
        }

        if (stableFrames < 2) {
          requestAnimationFrame(() => tick(attempt + 1))
          return
        }

        virtualizer.scrollToOffset(targetOffset, { behavior: "auto" })
      }

      tick(0)
    }

    return () => {
      scrollToItemHandlerRef.current = null
    }
  }, [scrollToItemHandlerRef, tree, virtualizer])

  const scrollOffset = virtualizer.scrollOffset ?? 0
  const viewportHeight = virtualizer.scrollRect?.height ?? 0
  const visibleStartIndex = Math.max(
    0,
    Math.floor(scrollOffset / INVENTORY_TREE_ROW_HEIGHT) -
      TREE_ROW_ACTIVE_BUFFER
  )
  const visibleEndIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollOffset + viewportHeight) / INVENTORY_TREE_ROW_HEIGHT) +
      TREE_ROW_ACTIVE_BUFFER
  )

  return (
    <div ref={wrapperRef}>
      <Tree
        ref={virtualizer.containerRef}
        tree={tree}
        indent={TREE_INDENT}
        className="relative"
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items.at(virtualRow.index)
          if (!item) {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 flex w-full flex-col pb-0.5"
              >
                <InventoryTreeRowSkeleton isFolder={false} level={0} />
              </div>
            )
          }

          const id = item.getId()
          const data = item.getItemData()
          const shouldRenderSkeleton =
            virtualizer.isScrolling &&
            (virtualRow.index < visibleStartIndex ||
              virtualRow.index > visibleEndIndex)

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 flex w-full flex-col pb-0.5"
            >
              {shouldRenderSkeleton ? (
                <InventoryTreeRowSkeleton
                  isFolder={data.kind === "folder"}
                  level={item.getItemMeta().level}
                />
              ) : (
                <InventoryTreeRow
                  item={item}
                  tree={tree}
                  getStatus={getStatus}
                  isFavorite={favoriteIds.has(id)}
                  onPrimaryAction={handlePrimaryAction}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            </div>
          )
        })}
        <TreeDragLine />
      </Tree>
    </div>
  )
}

interface InventoryTreeRowProps {
  getStatus: (itemId: string) => string | undefined
  isFavorite: boolean
  item: ItemInstance<ApiTreeNode>
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
  onToggleFavorite: (itemId: string) => void
  tree: TreeInstance<ApiTreeNode>
}

function InventoryTreeRow({
  getStatus,
  isFavorite,
  item,
  onPrimaryAction,
  onToggleFavorite,
  tree,
}: InventoryTreeRowProps) {
  const data = item.getItemData()
  const id = item.getId()
  const isFolder = data.kind === "folder"
  const itemName = item.getItemName()

  return (
    <TreeItem
      item={item}
      className="group/row"
      render={<div />}
      onClick={(event) => {
        const rowEvent = event as TreeRowMouseEvent

        if (hasSelectionModifier(rowEvent)) {
          applySelectionFromClick(rowEvent, item, tree)
          preventBaseTreeHandler(rowEvent)
          return
        }

        if (!isFolder) {
          return
        }

        focusTreeItem(item)
        onPrimaryAction(id, data)
        preventBaseTreeHandler(rowEvent)
      }}
      onDoubleClick={(event) => {
        const rowEvent = event as TreeRowMouseEvent

        if (!isFolder || hasSelectionModifier(rowEvent)) {
          return
        }

        focusTreeItem(item)
        toggleFolder(item)
      }}
    >
      <TreeItemLabel
        hideToggle
        className="w-full group-has-[button[data-popup-open]]/row:bg-muted"
      >
        {isFolder && <TreeItemToggle />}
        <InventoryNodeIcon
          node={data}
          status={getStatus(id)}
          isExpanded={item.isExpanded()}
        />
        <span
          className={cn("ml-1 flex-1 truncate", isFolder && "font-semibold")}
        >
          {itemName}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {isFolder && data.effective_vm_limit != null && (
            <Badge variant="secondary">
              {data.vm_count ?? 0} / {data.effective_vm_limit}
            </Badge>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={
              isFavorite
                ? `Remove ${itemName} from favorites`
                : `Add ${itemName} to favorites`
            }
            className={cn(
              isFavorite
                ? "bg-transparent! opacity-100!"
                : "opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(id)
            }}
          >
            <HugeiconsIcon
              icon={StarIcon}
              className={cn(
                isFavorite && "fill-muted-foreground dark:fill-muted-foreground"
              )}
            />
          </Button>
          <InventoryNodeMenu
            itemId={id}
            data={data}
            className="bg-transparent! opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        </div>
      </TreeItemLabel>
    </TreeItem>
  )
}
