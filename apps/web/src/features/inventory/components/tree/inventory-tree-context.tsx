import { createContext, use } from "react"
import type { RefObject } from "react"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

export interface InventoryTreeDataContextValue {
  canPowerByFolderId: Map<string, boolean>
  getStatus: (itemId: string) => string | undefined
  isLoading: boolean
  error: Error | null
  isEmpty: boolean
  getItemData: (itemId: string) => ApiTreeNode | undefined
}

export interface InventoryTreeViewContextValue {
  tree: TreeInstance<ApiTreeNode>
  expandedItemIds: Array<string>
  expandAll: () => void
  collapseAll: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  isSearchActive: boolean
  searchResultCount: number
  favoriteIds: Set<string>
  toggleFavorite: (itemId: string) => void
  selectedItemIds: Array<string>
  replaceSelection: (itemIds: Array<string>) => void
  clearSelection: () => void
  scrollToItemHandlerRef: RefObject<((itemId: string) => void) | null>
}

export interface InventoryTreeNavigationContextValue {
  handlePrimaryAction: (itemId: string, data: ApiTreeNode) => void
  revealAndNavigateToItem: (itemId: string) => void
}

export const InventoryTreeDataContext =
  createContext<InventoryTreeDataContextValue | null>(null)

export const InventoryTreeViewContext =
  createContext<InventoryTreeViewContextValue | null>(null)

export const InventoryTreeNavigationContext =
  createContext<InventoryTreeNavigationContextValue | null>(null)

export function useInventoryTreeDataContext() {
  const ctx = use(InventoryTreeDataContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeDataContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

export function useInventoryTreeViewContext() {
  const ctx = use(InventoryTreeViewContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeViewContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

export function useInventoryTreeNavigationContext() {
  const ctx = use(InventoryTreeNavigationContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeNavigationContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

export function useOptionalInventoryTreeNavigationContext() {
  return use(InventoryTreeNavigationContext)
}
