import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ApiNetworkBridge } from "@/features/vms/types/vm-types"

export type NetworkOption = {
  label: string
  value: string
}

export function buildVmHardwareNetworkOptions(data: {
  bridges?: Array<ApiNetworkBridge>
  vnets?: Array<ApiVNet>
}) {
  const bridgeOptions: Array<NetworkOption> =
    data.bridges?.map((bridge) => ({
      label: bridge.iface,
      value: bridge.iface,
    })) ?? []
  const vnetOptions: Array<NetworkOption> =
    data.vnets?.map((vnet) => ({
      label: vnet.vnet,
      value: vnet.vnet,
    })) ?? []

  return {
    bridgeOptions,
    vnetOptions,
    networkOptions: [...bridgeOptions, ...vnetOptions],
  }
}

export function getSelectOptionLabel(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string | undefined
) {
  if (!value) return undefined
  return options.find((option) => option.value === value)?.label
}
