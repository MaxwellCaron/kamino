import { InventorySelectionActionBar } from "./inventory-selection-action-bar"
import { InventoryTreeContent } from "./tree-content"
import { useInventoryTreeContext } from "./inventory-tree-context"
import { SidebarListSkeleton } from "@/components/loading-skeletons"

export function InventoryTreeBody() {
  const { tree, getStatus, isLoading, error, isEmpty } =
    useInventoryTreeContext()

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
    )
  }

  if (isEmpty) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">
        No inventory items
      </div>
    )
  }

  if (isLoading) {
    return <SidebarListSkeleton />
  }

  return (
    <div className="flex flex-col gap-1 pt-1">
      <InventoryTreeContent tree={tree} getStatus={getStatus} />
      <InventorySelectionActionBar />
    </div>
  )
}
