import type { ApiInventoryItem } from "@/features/inventory/types/inventory-types"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import { apiJson } from "@/features/shared/api/api-json"

export type PodRouterCloneOptions = {
  router_template_configured: boolean
  network_profiles: Array<PodNetworkProfile>
  clone_targets: Array<PodCloneTarget>
}

export type PodRouterCloneResult = {
  vmid: number
  item_id: string
  item: ApiInventoryItem
  target_folder_id: string
  network_number: number
  network_profile_key: PodNetworkProfile["key"]
  clone_target_key: string
  vnets: Array<string>
}

export type CloneRouterParams = {
  target_folder_id: string
  network_number: number
  network_profile_key: PodNetworkProfile["key"]
  clone_target_key: string
  vmid: number
}

export const routerCloneOptionsQueryOptions = {
  queryKey: ["pods", "router-clone", "options"] as const,
  queryFn: (): Promise<PodRouterCloneOptions> =>
    apiJson<PodRouterCloneOptions>(
      "/api/v1/pods/router-clone/options",
      "fetch pod router clone options"
    ),
}

export async function cloneRouter(
  params: CloneRouterParams
): Promise<PodRouterCloneResult> {
  return apiJson<PodRouterCloneResult>(
    "/api/v1/pods/router-clone",
    "clone pod router",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}
