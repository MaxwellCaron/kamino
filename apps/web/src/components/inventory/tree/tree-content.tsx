import { IconFolder, IconFolderOpen } from "@tabler/icons-react"
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@workspace/ui/components/reui/tree"
import { InventoryNodeMenu } from "../inventory-actions"
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
  return (
    <Tree tree={tree} indent={TREE_INDENT}>
      {tree.getItems().map((item) => {
        const data = item.getItemData()
        const id = item.getId()

        return (
          <TreeItem key={id} item={item} className="group/row" render={<div />}>
            <TreeItemLabel className="w-full bg-sidebar group-has-[button[data-popup-open]]/row:bg-muted">
              {data.kind === "folder" ? (
                item.isExpanded() ? (
                  <IconFolderOpen className="size-4 text-muted-foreground" />
                ) : (
                  <IconFolder className="size-4 text-muted-foreground" />
                )
              ) : (
                <VmIcon
                  status={getStatus(id)}
                  isTemplate={data.vm?.is_template}
                />
              )}
              <span className="ml-1">{item.getItemName()}</span>
              <InventoryNodeMenu
                itemId={id}
                data={data}
                className="ml-auto bg-transparent! opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
              />
            </TreeItemLabel>
          </TreeItem>
        )
      })}
      <TreeDragLine />
    </Tree>
  )
}
