import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ApiScopedNetwork } from "@/features/vms/api/proxmox-options-api"
import type { ApiNetworkBridge } from "@/features/vms/types/vm-types"

export type NetworkData = {
  bridges: Array<ApiNetworkBridge>
  vnets: Array<ApiVNet>
  scoped_network?: ApiScopedNetwork
}

export { formatFieldError } from "@/components/forms/form-errors"
