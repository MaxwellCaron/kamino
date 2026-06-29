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
import { InventoryNodeMenu } from "../inventory-actions"
import { InventoryNodeIcon } from "../inventory-node-icon"
import { TREE_INDENT } from "../../utils/constants"
import { useInventoryTreeContext } from "./inventory-tree-context"
import type { MouseEvent as ReactMouseEvent } from "react"
import type { ItemInstance, TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

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

function focusTreeItem(
  item: ItemInstance<ApiTreeNode>,
  tree: TreeInstance<ApiTreeNode>
) {
  item.setFocused()
  tree.updateDomFocus()
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

  focusTreeItem(item, tree)
}

export function InventoryTreeContent({
  getStatus,
  tree,
}: {
  getStatus: (itemId: string) => string | undefined
  tree: TreeInstance<ApiTreeNode>
}) {
  const { favoriteIds, toggleFavorite, handlePrimaryAction } =
    useInventoryTreeContext()

  return (
    <Tree tree={tree} indent={TREE_INDENT}>
      {tree.getItems().map((item) => {
        const id = item.getId()

        return (
          <InventoryTreeRow
            key={id}
            item={item}
            tree={tree}
            getStatus={getStatus}
            isFavorite={favoriteIds.has(id)}
            onPrimaryAction={handlePrimaryAction}
            onToggleFavorite={toggleFavorite}
          />
        )
      })}
      <TreeDragLine />
    </Tree>
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

        focusTreeItem(item, tree)
        onPrimaryAction(id, data)
        preventBaseTreeHandler(rowEvent)
      }}
      onDoubleClick={(event) => {
        const rowEvent = event as TreeRowMouseEvent

        if (!isFolder || hasSelectionModifier(rowEvent)) {
          return
        }

        focusTreeItem(item, tree)
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
            <Badge
              variant="secondary"
              className="bg-muted/50 text-muted-foreground tabular-nums"
              title="VM/template count"
            >
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
                : "opacity-0 group-hover/row:opacity-100"
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
            className="bg-transparent! opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
          />
        </div>
      </TreeItemLabel>
    </TreeItem>
  )
}
