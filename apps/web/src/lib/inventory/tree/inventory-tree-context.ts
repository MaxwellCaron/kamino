import type { ApiTreeNode } from "../inventory-types"
import type { RefObject } from "react"
import type { TreeInstance } from "@headless-tree/core"
import { createContext } from "react"

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
