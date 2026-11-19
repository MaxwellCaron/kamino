import type { ApiInventoryItem } from "@/lib/inventory/inventory-types"
import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"
import type { PodNetworkProfile } from "@/lib/pods/create-pod-api"
import { apiJson } from "@/lib/api/api-json"

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
