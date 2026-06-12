import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ApiNetworkBridge } from "@/features/vms/types/vm-types"

export type NetworkData = {
  bridges: Array<ApiNetworkBridge>
  vnets: Array<ApiVNet>
}

export function formatFieldError(error: unknown) {
  return typeof error === "string" ? error : undefined
}
