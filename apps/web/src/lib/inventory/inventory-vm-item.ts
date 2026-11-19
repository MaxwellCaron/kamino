import type { PodNetworkSegmentKind } from "@/lib/pods/pod-networking"

export type InventoryVmItemAddress = {
  label: PodNetworkSegmentKind
  address: string
}
