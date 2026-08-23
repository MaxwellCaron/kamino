import { Skeleton } from "@workspace/ui/components/skeleton"
import { TREE_INDENT } from "../../utils/constants"
import type { CSSProperties } from "react"

export const INVENTORY_TREE_ROW_GAP = 2
const INVENTORY_TREE_ROW_CONTENT_HEIGHT = 32
export const INVENTORY_TREE_ROW_HEIGHT =
  INVENTORY_TREE_ROW_CONTENT_HEIGHT + INVENTORY_TREE_ROW_GAP

export function InventoryTreeRowSkeleton({
  isFolder,
  level,
}: {
  isFolder: boolean
  level: number
}) {
  const indentStyle: CSSProperties = {
    paddingInlineStart: level * TREE_INDENT + 8,
  }

  return (
    <div
      aria-hidden="true"
      data-testid="inventory-tree-row-skeleton"
      className="pointer-events-none flex h-8 items-center gap-1 px-2"
      style={indentStyle}
    >
      {isFolder ? (
        <Skeleton className="size-4 shrink-0 rounded-md" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <Skeleton className="size-4 shrink-0 rounded-md" />
      <Skeleton className="h-4 min-w-0 flex-1 rounded-md" />
    </div>
  )
}
