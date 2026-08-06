import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export type PodCloneTarget = {
  key: string
  label: string
  network_profile_key: string
  lan_vnet: string
  dmz_vnet: string
  wan_bridge: string
  wan_subnet: string
  network_min: number
  network_max: number
  cloud_init_storage: string
  cloud_init_user_file_pattern: string
  cloud_init_network_file: string
  lan_dmz_user_file_pattern?: string
  lan_dmz_network_file?: string
  is_default: boolean
}

// Snippet filenames are derived from the key server-side and returned read-only.
export type PodCloneTargetInput = Omit<
  PodCloneTarget,
  | "is_default"
  | "cloud_init_user_file_pattern"
  | "cloud_init_network_file"
  | "lan_dmz_user_file_pattern"
  | "lan_dmz_network_file"
>

export const podCloneTargetsQueryOptions = {
  queryKey: ["pods", "clone-targets"] as const,
  queryFn: async (): Promise<Array<PodCloneTarget>> => {
    const response = await apiJson<{ clone_targets: Array<PodCloneTarget> }>(
      "/api/v1/pods/clone-targets",
      "fetch pod clone targets"
    )
    return response.clone_targets
  },
}

export async function createPodCloneTarget(
  params: PodCloneTargetInput
): Promise<PodCloneTarget> {
  return apiJson<PodCloneTarget>(
    "/api/v1/pods/clone-targets",
    "create pod clone target",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}

export async function updatePodCloneTarget(
  key: string,
  params: Omit<PodCloneTargetInput, "key">
): Promise<PodCloneTarget> {
  return apiJson<PodCloneTarget>(
    `/api/v1/pods/clone-targets/${encodeURIComponent(key)}`,
    "update pod clone target",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}

export async function deletePodCloneTarget(key: string): Promise<void> {
  await apiVoid(
    `/api/v1/pods/clone-targets/${encodeURIComponent(key)}`,
    "delete pod clone target",
    { method: "DELETE" }
  )
}
