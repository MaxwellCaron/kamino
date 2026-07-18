import type { ApiInventoryItem } from "@/features/inventory/types/inventory-types"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import { apiJson } from "@/features/shared/api/api-json"

export type PodRouterCloneNetworkOption = {
  network_number: number
  network_profile_key: PodNetworkProfile["key"]
  vnets: Array<string>
}

export type PodRouterCloneOptions = {
  router_template_configured: boolean
  network_profiles: Array<PodNetworkProfile>
  network_options: Array<PodRouterCloneNetworkOption>
}

export type PodRouterCloneResult = {
  vmid: number
  item_id: string
  item: ApiInventoryItem
  target_folder_id: string
  network_number: number
  network_profile_key: PodNetworkProfile["key"]
  vnets: Array<string>
}

export type CloneRouterParams = {
  target_folder_id: string
  network_number: number
  network_profile_key: PodNetworkProfile["key"]
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
