import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "../api/inventory-api"
import { apiUrl } from "@/features/auth/api/auth-api"

type InventoryChangedEvent = {
  type: "inventory.changed"
  scope?: string
  item_id?: string
  timestamp: string
}

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/v1/inventory/events"), {
      withCredentials: true,
    })

    source.addEventListener("inventory.changed", (event) => {
      const payload = JSON.parse(event.data) as InventoryChangedEvent
      if (payload.scope && payload.scope !== "tree") return

      const treeQuery = queryClient.getQueryState(
        inventoryTreeQueryOptions.queryKey
      )

      if (treeQuery?.fetchStatus === "fetching") return

      const eventUpdatedAt = Date.parse(payload.timestamp)
      if (
        Number.isFinite(eventUpdatedAt) &&
        treeQuery &&
        treeQuery.dataUpdatedAt >= eventUpdatedAt
      ) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    })

    return () => {
      source.close()
    }
  }, [queryClient])

  return null
}
