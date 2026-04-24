import { useQueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/lib/queries"
import { useAuthenticatedEventSource } from "@/hooks/use-authenticated-event-source"

type InventoryChangedEvent = {
  type: "inventory.changed"
  scope?: string
  item_id?: string
  timestamp: string
}

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useAuthenticatedEventSource({
    path: "/api/v1/inventory/events",
    eventHandlers: {
      "inventory.changed": (event) => {
        if (!(event instanceof MessageEvent)) return

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
      },
    },
  })

  return null
}
