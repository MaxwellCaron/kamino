import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getAccessToken, inventoryTreeQueryOptions } from "@/lib/queries"

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const token = getAccessToken()
    const url = token
      ? `/api/v1/inventory/events?token=${encodeURIComponent(token)}`
      : "/api/v1/inventory/events"
    const eventSource = new EventSource(url)

    const invalidateTree = () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    }

    eventSource.addEventListener("inventory.changed", invalidateTree)

    return () => {
      eventSource.removeEventListener("inventory.changed", invalidateTree)
      eventSource.close()
    }
  }, [queryClient])

  return null
}
