import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/lib/queries"

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const eventSource = new EventSource("/api/v1/inventory/events")

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
