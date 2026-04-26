import { createContext, use } from "react"
import type { ApiInventoryItem } from "@/features/inventory/types/inventory-types"

interface VmContextValue {
  item: ApiInventoryItem
  itemId: string
}

export const VmContext = createContext<VmContextValue | null>(null)

export function useVmContext() {
  const context = use(VmContext)
  if (!context) {
    throw new Error("useVmContext must be used within a VmProvider")
  }
  return context
}
