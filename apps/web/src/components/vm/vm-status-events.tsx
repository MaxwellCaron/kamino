import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, vmStatusQueryOptions } from "@/lib/queries"

type VmStatusEvent = {
  type: "vm.statuses.changed"
  statuses: Record<number, string>
  timestamp: string
}

export function VmStatusEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/v1/vms/events"), {
      withCredentials: true,
    })

    source.addEventListener("vm.statuses.changed", (event) => {
      const payload = JSON.parse(event.data) as VmStatusEvent
      queryClient.setQueryData(vmStatusQueryOptions.queryKey, payload.statuses)
    })

    return () => {
      source.close()
    }
  }, [queryClient])

  return null
}
