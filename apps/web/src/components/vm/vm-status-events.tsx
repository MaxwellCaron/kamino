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
    const eventSource = new EventSource(apiUrl("/api/v1/vms/events"), {
      withCredentials: true,
    })

    const handleStatusesChanged = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = JSON.parse(event.data) as VmStatusEvent
      queryClient.setQueryData(vmStatusQueryOptions.queryKey, payload.statuses)
    }

    eventSource.addEventListener("vm.statuses.changed", handleStatusesChanged)

    return () => {
      eventSource.removeEventListener(
        "vm.statuses.changed",
        handleStatusesChanged
      )
      eventSource.close()
    }
  }, [queryClient])

  return null
}
