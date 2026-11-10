import type { ApiNetworkBridge } from "@/lib/vms/vm-types"
import type { ApiScopedNetwork } from "@/lib/vms/proxmox-options-api"
import type { ApiVNet } from "@/lib/sdn/sdn-types"

export type NetworkData = {
  bridges: Array<ApiNetworkBridge>
  vnets: Array<ApiVNet>
  scoped_network?: ApiScopedNetwork
}

export { formatFieldError } from "@/lib/forms/form-errors"
