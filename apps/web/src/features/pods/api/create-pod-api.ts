import type { ApiInventoryItem } from "@/features/inventory/types/inventory-types"
import type { CreatePodFormValues } from "@/features/pods/components/create/create-pod-form"
import { apiFetch } from "@/features/auth/api/auth-api"

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

export type CreatePodOptions = {
  router_template_configured: boolean
  templates: Array<PodTemplateOption>
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
  queryFn: async (): Promise<CreatePodOptions> => {
    const res = await apiFetch("/api/v1/pods/create/options")
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        body.error ?? `Failed to fetch pod create options: ${res.status}`
      )
    }
    return res.json()
  },
}

export async function validatePodNameAvailability(
  name: string,
  signal?: AbortSignal
): Promise<PodNameAvailability> {
  const params = new URLSearchParams({ name })
  const res = await apiFetch(
    `/api/v1/pods/create/name-availability?${params.toString()}`,
    { signal }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to validate pod name: ${res.status}`)
  }

  return res.json()
}

export async function createPod(
  params: {
    values: CreatePodFormValues
    progressId: string
  }
): Promise<CreatePodResult> {
  const query = new URLSearchParams({ progress_id: params.progressId })
  const res = await apiFetch(`/api/v1/pods?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.values.name,
      include_router: params.values.includeRouter,
      templates: params.values.templates.map((template) => ({
        template_item_id: template.templateItemId,
        vms: template.vms.map((vm) => ({
          name: vm.name,
          cpu_count: vm.cpuCount,
          memory_gb: vm.memoryGb,
          storage_gb: vm.storageGb,
        })),
      })),
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create pod: ${res.status}`)
  }

  return res.json()
}

export function createPodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "create", "progress", progressId] as const,
    queryFn: async (): Promise<CreatePodProgress> => {
      const res = await apiFetch(
        `/api/v1/pods/create/progress/${encodeURIComponent(progressId ?? "")}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch create progress: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: 750,
  }
}
