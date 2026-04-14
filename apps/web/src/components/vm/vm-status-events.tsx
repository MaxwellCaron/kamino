import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, ensureAuth, vmStatusQueryOptions } from "@/lib/queries"

type VmStatusEvent = {
  type: "vm.statuses.changed"
  statuses: Record<number, string>
  timestamp: string
}

export function VmStatusEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    const handleStatusesChanged = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = JSON.parse(event.data) as VmStatusEvent
      queryClient.setQueryData(vmStatusQueryOptions.queryKey, payload.statuses)
    }

    void ensureAuth()
      .then(() => {
        if (cancelled) return

        eventSource = new EventSource(apiUrl("/api/v1/vms/events"), {
          withCredentials: true,
        })
        eventSource.addEventListener(
          "vm.statuses.changed",
          handleStatusesChanged
        )
      })
      .catch(() => {
        // Route auth will handle redirect if the session cannot be refreshed.
      })

    return () => {
      cancelled = true
      eventSource?.removeEventListener(
        "vm.statuses.changed",
        handleStatusesChanged
      )
      eventSource?.close()
    }
  }, [queryClient])

  return null
}
