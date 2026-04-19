import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, ensureAuth, inventoryTreeQueryOptions } from "@/lib/queries"

type InventoryChangedEvent = {
  type: "inventory.changed"
  scope?: string
  item_id?: string
  timestamp: string
}

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    const handleInventoryChanged = (event: Event) => {
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
    }

    void ensureAuth()
      .then(() => {
        if (cancelled) return

        eventSource = new EventSource(apiUrl("/api/v1/inventory/events"), {
          withCredentials: true,
        })
        eventSource.addEventListener(
          "inventory.changed",
          handleInventoryChanged
        )
      })
      .catch(() => {
        // Route auth will handle redirect if the session cannot be refreshed.
      })

    return () => {
      cancelled = true
      eventSource?.removeEventListener(
        "inventory.changed",
        handleInventoryChanged
      )
      eventSource?.close()
    }
  }, [queryClient])

  return null
}
