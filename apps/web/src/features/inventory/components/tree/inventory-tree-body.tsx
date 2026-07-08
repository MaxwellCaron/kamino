import { InventorySelectionActionBar } from "./inventory-selection-action-bar"
import { InventoryTreeLoadingSkeleton } from "./inventory-tree-loading-skeleton"
import { InventoryTreeContent } from "./tree-content"
import { useInventoryTreeContext } from "./inventory-tree-context"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"

export function InventoryTreeBody() {
  const {
    tree,
    getStatus,
    isLoading,
    error,
    isEmpty,
    isSearchActive,
    searchResultCount,
  } = useInventoryTreeContext()

  if (error) {
    return (
      <InlineErrorAlert
        error={error}
        fallback="Failed to load inventory tree."
        className="mx-4 mt-2"
      />
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
    return <InventoryTreeLoadingSkeleton />
  }

  if (isSearchActive && searchResultCount === 0) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">
        No matching inventory items
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 pt-1">
      <InventoryTreeContent tree={tree} getStatus={getStatus} />
      <InventorySelectionActionBar />
    </div>
  )
}
