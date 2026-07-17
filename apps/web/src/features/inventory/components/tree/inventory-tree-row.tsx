import { memo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  MoreHorizontalIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { stopTreeItemEvent } from "../inventory-actions/inventory-action-utils"
import { InventoryNodeMenu } from "../inventory-actions/inventory-node-menu"
import { InventoryNodeIcon } from "../inventory-node-icon"
import { TREE_INDENT } from "../../utils/constants"
import type { HTMLAttributes, MouseEvent as ReactMouseEvent, Ref } from "react"
import type { ItemInstance, TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"
import type { InventoryTreeRowVm } from "./tree-content-utils"

interface InventoryTreeRowProps {
  vm: InventoryTreeRowVm
  data: ApiTreeNode
  item: ItemInstance<ApiTreeNode>
  tree: TreeInstance<ApiTreeNode>
  onPrimaryAction: (itemId: string, data: ApiTreeNode) => void
  onToggleFavorite: (itemId: string) => void
}

interface SelectionDataRef {
  selectUpToAnchorId?: string | null
}

type TreeItemDomProps = HTMLAttributes<HTMLDivElement> & {
  draggable?: boolean
  ref?: Ref<HTMLDivElement>
  tabIndex?: number
}

const rowMenuButtonClassName =
  "bg-transparent! opacity-0 transition-opacity group-has-[:focus-visible]/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"

function hasSelectionModifier(event: ReactMouseEvent<HTMLElement>) {
  return event.shiftKey || event.ctrlKey || event.metaKey
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
  event: ReactMouseEvent<HTMLElement>,
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

export const InventoryTreeRow = memo(function InventoryTreeRowImpl({
  vm,
  data,
  item,
  tree,
  onPrimaryAction,
  onToggleFavorite,
}: InventoryTreeRowProps) {
  const [isMenuMounted, setIsMenuMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const {
    className: libClassName,
    onClick: libOnClick,
    onFocus: libOnFocus,
    style: libStyle,
    ...libProps
  } = item.getProps() as TreeItemDomProps

  return (
    <div
      {...libProps}
      data-slot="tree-item"
      data-focus={vm.isFocused || undefined}
      data-folder={vm.isFolder || undefined}
      data-selected={vm.isSelected || undefined}
      data-drag-target={vm.isDragTarget || undefined}
      data-search-match={vm.isSearchMatch || undefined}
      aria-expanded={vm.isExpanded}
      style={{
        ...(libStyle ?? {}),
        paddingInlineStart: vm.level * TREE_INDENT,
      }}
      className={cn(
        libClassName,
        "group/row z-10 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left outline-hidden select-none not-last:pb-0.5 focus:z-20 data-disabled:pointer-events-none data-disabled:opacity-50"
      )}
      onFocus={libOnFocus}
      onClick={(event) => {
        if (hasSelectionModifier(event)) {
          applySelectionFromClick(event, item, tree)
          return
        }

        if (vm.isFolder) {
          focusTreeItem(item)
          onPrimaryAction(vm.id, data)
          return
        }

        libOnClick?.(event)
      }}
      onDoubleClick={(event) => {
        if (!vm.isFolder || hasSelectionModifier(event)) {
          return
        }

        focusTreeItem(item)
        toggleFolder(item)
      }}
    >
      <span
        data-slot="tree-item-label"
        className="flex h-8 w-full items-center gap-1 rounded-3xl px-2 py-0 text-sm transition-colors not-in-data-[folder=true]:ps-7 group-has-[button[data-popup-open]]/row:bg-muted hover:bg-muted in-focus-visible:ring-[3px] in-focus-visible:ring-ring/50 in-data-[drag-target=true]:bg-muted in-data-[search-match=true]:bg-blue-50! in-data-[selected=true]:bg-sidebar-border! in-data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0"
      >
        {vm.isFolder ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${vm.isExpanded ? "Collapse" : "Expand"} ${vm.name}`}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted/80"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              toggleFolder(item)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
            }}
          >
            <HugeiconsIcon
              icon={ChevronDownIcon}
              className="size-4 text-muted-foreground in-aria-[expanded=false]:-rotate-90"
            />
          </button>
        ) : null}
        <InventoryNodeIcon
          node={data}
          status={vm.status}
          isExpanded={vm.isExpanded}
        />
        <span
          className={cn("ml-1 flex-1 truncate", vm.isFolder && "font-semibold")}
        >
          {vm.name}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {vm.isFolder && vm.vmLimit != null ? (
            <Badge variant="secondary">
              {vm.vmCount ?? 0} / {vm.vmLimit}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={
              vm.isFavorite
                ? `Remove ${vm.name} from favorites`
                : `Add ${vm.name} to favorites`
            }
            className={cn(
              vm.isFavorite
                ? "bg-transparent! opacity-100!"
                : "opacity-0 transition-opacity group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 focus-visible:opacity-100"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(vm.id)
            }}
          >
            <HugeiconsIcon
              icon={StarIcon}
              className={cn(
                vm.isFavorite &&
                  "fill-muted-foreground dark:fill-muted-foreground"
              )}
            />
          </Button>
          {vm.hasActions ? (
            !isMenuMounted ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Actions for ${vm.name}`}
                aria-haspopup="menu"
                className={rowMenuButtonClassName}
                onClick={(event) => {
                  stopTreeItemEvent(event)
                  setIsMenuMounted(true)
                  setMenuOpen(true)
                }}
                onPointerDown={stopTreeItemEvent}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </Button>
            ) : (
              <InventoryNodeMenu
                itemId={vm.id}
                data={data}
                canPower={vm.canPower}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                className={rowMenuButtonClassName}
              />
            )
          ) : null}
        </div>
      </span>
    </div>
  )
})
