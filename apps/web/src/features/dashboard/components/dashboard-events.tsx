import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { PublishPodProgress } from "@/features/pods/api/publish-pod-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { subscribeToJsonEventStream } from "@/features/shared/api/event-stream"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

type InventoryChangedEvent = {
  type: "inventory.changed"
  scope?: string
  timestamp: string
}

type VmStatusEvent = {
  type: "vm.statuses.changed"
  statuses: Record<number, string>
  timestamp: string
}

type RequestChangedEvent = {
  type: "request.changed"
  request_id?: string
  timestamp: string
}

type DashboardEventMap = {
  "inventory.changed": InventoryChangedEvent
  "pod.publish.progress": PublishPodProgress
  "vm.statuses.changed": VmStatusEvent
  "request.changed": RequestChangedEvent
}

export function DashboardEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    return subscribeToJsonEventStream<DashboardEventMap>("/api/v1/events", {
      "inventory.changed": (payload) => {
        if (payload.scope && payload.scope !== "tree") return

        const treeQuery = queryClient.getQueryState(
          inventoryTreeQueryOptions.queryKey
        )


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
          ["pods", "published", "progress", payload.id],
          payload
        )
      },
    })
  }, [queryClient])

  return null
}
