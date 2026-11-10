import type { ApiTreeNode } from "@/lib/inventory/inventory-types"
import type { ReactNode } from "react"

export type InventoryDeleteItem = {
  id: string
  name: string
  icon: ReactNode
  successDescription?: string
}

export function collectInventoryDeleteItemIds(node: ApiTreeNode) {
  const ids: Array<string> = []

  function visit(item: ApiTreeNode) {
    ids.push(item.id)
    for (const child of item.children ?? []) visit(child)
  }

  visit(node)
  return ids
}
