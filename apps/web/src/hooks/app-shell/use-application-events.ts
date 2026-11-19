import type { DashboardEventMap } from "@/lib/app-shell/application-events"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"
import { publishedPodProgressQueryOptions } from "@/lib/pods/publish-pod-api"
import { subscribeToJsonEventStream } from "@/lib/api/event-stream"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { vmStatusQueryOptions } from "@/lib/vms/vm-api"

export function useApplicationEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    return subscribeToJsonEventStream<DashboardEventMap>(
      "/api/v1/events",
      {
        "inventory.changed": (payload) => {
          if (payload.scope && payload.scope !== "tree") return

          void queryClient.invalidateQueries({
            queryKey: inventoryTreeQueryOptions.queryKey,
          })
        },
        "vm.statuses.changed": (payload) => {
          queryClient.setQueryData(
            vmStatusQueryOptions.queryKey,
            payload.statuses
          )
        },
        "request.changed": (payload) => {
          void queryClient.invalidateQueries({ queryKey: ["requests"] })
          if (payload.request_id) {
            void queryClient.invalidateQueries({
              queryKey: ["requests", payload.request_id],
            })
          }
        },
        "pod.publish.progress": (payload) => {
          queryClient.setQueryData(
            publishedPodProgressQueryOptions(payload.id, true).queryKey,
            payload
          )
        },
      },
      {
        onOpen: ({ reconnected }) => {
          if (!reconnected) return

          void queryClient.invalidateQueries({
            queryKey: inventoryTreeQueryOptions.queryKey,
          })
          void queryClient.invalidateQueries({ queryKey: ["requests"] })
        },
      }
    )
  }, [queryClient])
}
