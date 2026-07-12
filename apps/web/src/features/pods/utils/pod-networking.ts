import { getPodNetworkingModeLabel } from "@/features/pods/components/create/create-pod-form"

export function getPublishNetworkProfileLabel(
  networkProfileKey: string
) {
  if (
    networkProfileKey === "lan-router-v1" ||
    networkProfileKey === "lan-dmz-router-v1"
  ) {
    return getPodNetworkingModeLabel(networkProfileKey)
  }

  return networkProfileKey
}

export function getPublishVmNetworkLabel(vm: {
  is_router?: boolean
  segment_key?: string | null
}) {
  if (vm.is_router) return "Router"
  if (vm.segment_key === "dmz") return "DMZ"
  if (vm.segment_key === "lan") return "LAN"
  return "—"
}
