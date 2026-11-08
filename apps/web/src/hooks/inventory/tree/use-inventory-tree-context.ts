import {
  InventoryTreeDataContext,
  InventoryTreeNavigationContext,
  InventoryTreeViewContext,
} from "@/lib/inventory/tree/inventory-tree-context"
import { use } from "react"

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
