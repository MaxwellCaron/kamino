import { InventoryDialogsContext } from "@/lib/inventory/inventory-dialogs-context"
import { use } from "react"

export function useInventoryDialogs() {
  const context = use(InventoryDialogsContext)

  if (!context) {
    throw new Error(
      "useInventoryDialogs must be used within an InventoryDialogsProvider."
    )
  }

  return context
}
