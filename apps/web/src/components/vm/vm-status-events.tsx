import { useQueryClient } from "@tanstack/react-query"
import { vmStatusQueryOptions } from "@/lib/queries"
import { useAuthenticatedEventSource } from "@/hooks/use-authenticated-event-source"

type VmStatusEvent = {
  type: "vm.statuses.changed"
  statuses: Record<number, string>
  timestamp: string
}

export function VmStatusEvents() {
  const queryClient = useQueryClient()

  useAuthenticatedEventSource({
    path: "/api/v1/vms/events",
    eventHandlers: {
      "vm.statuses.changed": (event) => {
        if (!(event instanceof MessageEvent)) return
        const payload = JSON.parse(event.data) as VmStatusEvent
        queryClient.setQueryData(vmStatusQueryOptions.queryKey, payload.statuses)
      },
    },
  })

  return null
}
