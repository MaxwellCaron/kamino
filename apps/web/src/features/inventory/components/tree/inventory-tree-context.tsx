import { createContext, use } from "react"
import type { RefObject } from "react"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

export interface InventoryTreeContextValue {
  tree: TreeInstance<ApiTreeNode>
  expandAll: () => void
  collapseAll: () => void
  canPowerByFolderId: Map<string, boolean>
  getStatus: (itemId: string) => string | undefined
  isLoading: boolean
  error: Error | null
  isEmpty: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  isSearchActive: boolean
  searchResultCount: number
  favoriteIds: Set<string>
  toggleFavorite: (itemId: string) => void
  getItemData: (itemId: string) => ApiTreeNode | undefined
  handlePrimaryAction: (itemId: string, data: ApiTreeNode) => void
  revealAndNavigateToItem: (itemId: string) => void
  selectedItemIds: Array<string>
  replaceSelection: (itemIds: Array<string>) => void
  clearSelection: () => void
  scrollToItemHandlerRef: RefObject<((itemId: string) => void) | null>
}

export const InventoryTreeContext =
  createContext<InventoryTreeContextValue | null>(null)

export function useInventoryTreeContext() {
  const ctx = use(InventoryTreeContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

export function useOptionalInventoryTreeContext() {
  return use(InventoryTreeContext)
}
