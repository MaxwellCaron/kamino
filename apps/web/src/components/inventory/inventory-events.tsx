import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, inventoryTreeQueryOptions } from "@/lib/queries"

export function InventoryEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const eventSource = new EventSource(apiUrl("/api/v1/inventory/events"), {
      withCredentials: true,
    })

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
