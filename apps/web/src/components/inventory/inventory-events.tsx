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
    let reconnectTimer: number | null = null

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

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const cleanupEventSource = () => {
      if (!eventSource) {
        return
      }

      eventSource.removeEventListener("inventory.changed", handleInventoryChanged)
      eventSource.onerror = null
      eventSource.close()
      eventSource = null
    }

    const scheduleReconnect = (delayMs: number) => {
      clearReconnectTimer()
      if (cancelled) {
        return
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, delayMs)
    }

    const connect = async () => {
      try {
        await ensureAuth()
        if (cancelled) {
          return
        }

        cleanupEventSource()

        eventSource = new EventSource(apiUrl("/api/v1/inventory/events"), {
          withCredentials: true,
        })
        eventSource.addEventListener(
          "inventory.changed",
          handleInventoryChanged
        )
        eventSource.onerror = () => {
          cleanupEventSource()
          scheduleReconnect(1_000)
        }
      } catch {
        // ensureAuth() redirects on auth failures. Retry later for transient errors.
        scheduleReconnect(5_000)
      }
    }

    void connect()

    return () => {
      cancelled = true
      clearReconnectTimer()
      cleanupEventSource()
    }
  }, [queryClient])

  return null
}
