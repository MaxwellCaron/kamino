import type { PublishPodProgress } from "@/lib/pods/publish-pod-api"

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

export type DashboardEventMap = {
  "inventory.changed": InventoryChangedEvent
  "pod.publish.progress": PublishPodProgress
  "vm.statuses.changed": VmStatusEvent
  "request.changed": RequestChangedEvent
}
