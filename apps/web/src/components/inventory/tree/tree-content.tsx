import { IconFolder, IconFolderOpen, IconStar } from "@tabler/icons-react"
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@workspace/ui/components/reui/tree"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { InventoryNodeMenu } from "../inventory-actions"
import { useInventoryTreeContext } from "./inventory-tree"
import { TREE_INDENT } from "./constants"
import { VmIcon } from "./vm-icon"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "@/lib/queries"

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
          <TreeItem key={id} item={item} className="group/row" render={<div />}>
            <TreeItemLabel className="w-full bg-sidebar group-has-[button[data-popup-open]]/row:bg-muted">
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
                {data.kind !== "folder" && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      "bg-transparent! transition-opacity",
                      isFavorite
                        ? "text-primary opacity-100! hover:text-primary/50"
                        : "opacity-0 group-hover/row:opacity-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(id)
                    }}
                  >
                    <IconStar
                      className={cn(isFavorite && "size-3.5 fill-primary/40")}
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
