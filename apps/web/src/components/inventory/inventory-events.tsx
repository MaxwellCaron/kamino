import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, ensureAuth, inventoryTreeQueryOptions } from "@/lib/queries"

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    const invalidateTree = () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    }

    void ensureAuth()
      .then(() => {
        if (cancelled) return

        eventSource = new EventSource(apiUrl("/api/v1/inventory/events"), {
          withCredentials: true,
        })
        eventSource.addEventListener("inventory.changed", invalidateTree)
      })
      .catch(() => {
        // Route auth will handle redirect if the session cannot be refreshed.
      })

    return () => {
      cancelled = true
      eventSource?.removeEventListener("inventory.changed", invalidateTree)
      eventSource?.close()
    }
  }, [queryClient])

  return null
}
