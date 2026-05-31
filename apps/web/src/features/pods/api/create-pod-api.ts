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
  values: CreatePodFormValues
): Promise<CreatePodResult> {
  const res = await apiFetch("/api/v1/pods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: values.name,
      include_router: values.includeRouter,
      templates: values.templates.map((template) => ({
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
