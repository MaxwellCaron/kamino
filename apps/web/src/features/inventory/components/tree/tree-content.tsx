import { IconFolder, IconFolderOpen, IconStar } from "@tabler/icons-react"
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
  TreeItemToggle,
} from "@workspace/ui/components/reui/tree"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { InventoryNodeMenu } from "../inventory-actions"
import { TREE_INDENT } from "../../utils/constants"
import { useInventoryTreeContext } from "./inventory-tree-context"
import { VmIcon } from "./vm-icon"
import type { MouseEvent as ReactMouseEvent } from "react"
import type { ItemInstance, TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

interface SelectionDataRef {
  selectUpToAnchorId?: string | null
}

type TreeRowMouseEvent = ReactMouseEvent<HTMLElement, globalThis.MouseEvent> & {
  preventBaseUIHandler?: () => void
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

  item.setFocused()
  tree.updateDomFocus()
}

export function InventoryTreeContent({
  getStatus,
  tree,
}: {
  getStatus: (itemId: string) => string | undefined
  tree: TreeInstance<ApiTreeNode>
}) {
  const { favoriteIds, toggleFavorite } = useInventoryTreeContext()

  return (
    <Tree tree={tree} indent={TREE_INDENT}>
      {tree.getItems().map((item) => {
        const data = item.getItemData()
        const id = item.getId()
        const isFavorite = favoriteIds.has(id)

        return (
          <TreeItem
            key={id}
            item={item}
            className="group/row"
            render={<div />}
            onClick={(event) => {
              const isModifierSelection =
                event.shiftKey || event.ctrlKey || event.metaKey

              if (data.kind !== "folder" && !isModifierSelection) {
                return
              }

              applySelectionFromClick(event, item, tree)
              ;(event as TreeRowMouseEvent).preventBaseUIHandler?.()
            }}
            onDoubleClick={(event) => {
              if (
                data.kind !== "folder" ||
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey
              ) {
                return
              }

              item.setFocused()
              tree.updateDomFocus()

              if (item.isExpanded()) {
                item.collapse()
                return
              }

              item.expand()
            }}
          >
            <TreeItemLabel
              hideToggle
              className="w-full bg-sidebar group-has-[button[data-popup-open]]/row:bg-muted"
            >
              {data.kind === "folder" && <TreeItemToggle />}
              {data.kind === "folder" ? (
                item.isExpanded() ? (
                  <IconFolderOpen className="size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
                ) : (
                  <IconFolder className="size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
                )
              ) : (
                <VmIcon
                  status={getStatus(id)}
                  isTemplate={data.vm?.is_template}
                />
              )}
              <span className="ml-1 flex-1 truncate">{item.getItemName()}</span>
              <div className="ml-auto flex items-center gap-0.5">
                {data.kind === "folder" && data.effective_vm_limit != null && (
                  <Badge
                    variant="secondary"
                    className="bg-muted/50 text-muted-foreground tabular-nums"
                    title="VM/template count"
                  >
                    {data.vm_count ?? 0} / {data.effective_vm_limit}
                  </Badge>
                )}
                {data.kind !== "folder" && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className={
                      isFavorite
                        ? "bg-transparent! opacity-100!"
                        : "opacity-0 group-hover/row:opacity-100"
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(id)
                    }}
                  >
                    <IconStar
                      className={
                        isFavorite
                          ? "fill-muted-foreground dark:fill-muted-foreground"
                          : ""
                      }
                    />
                  </Button>
                )}
                <InventoryNodeMenu
                  itemId={id}
                  data={data}
                  className="bg-transparent! opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
                />
              </div>
            </TreeItemLabel>
          </TreeItem>
        )
      })}
      <TreeDragLine />
    </Tree>
  )
}
