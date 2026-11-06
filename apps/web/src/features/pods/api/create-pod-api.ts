import type { ApiInventoryItem } from "@/features/inventory/types/inventory-types"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type { PodNetworkingMode } from "@/features/pods/utils/pod-networking-mode"
import { apiJson } from "@/features/shared/api/api-json"

export type PodTemplateOption = {
  id: string
  name: string
  node: string
  vmid: number
  cpu_count?: number
  memory_mb?: number
  disk_gb?: number
  is_router_template: boolean
}

export type PodNetworkSegment = {
  key: string
  label: string
}

export type PodNetworkProfile = {
  key: Exclude<PodNetworkingMode, "none">
  label: string
  description: string
  default_segment_key?: string
  segments: Array<PodNetworkSegment>
  prefix_nat_segment_key?: string
}

export type CreatePodOptions = {
  router_template_configured: boolean
  network_profiles: Array<PodNetworkProfile>
  clone_targets: Array<PodCloneTarget>
  templates: Array<PodTemplateOption>
}

export type CreatePodInput = {
  name: string
  network_profile_key?: Exclude<PodNetworkingMode, "none">
  clone_target_key?: string
  templates: Array<{
    template_item_id: string
    vms: Array<{
      name: string
      cpu_count: number
      memory_gb: number
      storage_gb: number
      segment_key?: "lan" | "dmz"
    }>
  }>
}

export type CreatePodResult = {
  ok: boolean
  folder_id: string
  vms: Array<{
    template_item_id: string
    vmid: number
    item_id: string
    item: ApiInventoryItem
  }>
}

export type CreatePodProgress = {
  type: "pod.create.progress"
  id: string
  state: "running" | "success" | "error"
  step_id: number
  message: string
  updated_at: string
}

export type PodNameAvailability = {
  available: boolean
}

export const createPodOptionsQueryOptions = {
  queryKey: ["pods", "create", "options"] as const,
  queryFn: (): Promise<CreatePodOptions> =>
    apiJson<CreatePodOptions>(
      "/api/v1/pods/create/options",
      "fetch pod create options"
    ),
}

export async function validatePodNameAvailability(
  name: string,
  signal?: AbortSignal
): Promise<PodNameAvailability> {
  const params = new URLSearchParams({ name })
  return apiJson<PodNameAvailability>(
    `/api/v1/pods/create/name-availability?${params.toString()}`,
    "validate pod name",
    { signal }
  )
}

export async function createPod(params: {
  input: CreatePodInput
  progressId: string
}): Promise<CreatePodResult> {
  const query = new URLSearchParams({ progress_id: params.progressId })
  return apiJson<CreatePodResult>(
    `/api/v1/pods?${query.toString()}`,
    "create pod",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.input),
    }
  )
}

export function createPodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "create", "progress", progressId] as const,
    queryFn: (): Promise<CreatePodProgress> =>
      apiJson<CreatePodProgress>(
        `/api/v1/pods/create/progress/${encodeURIComponent(progressId ?? "")}`,
        "fetch create progress"
      ),
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: 750,
  }
}
