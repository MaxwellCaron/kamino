import type {
  ApiBulkVmMutationResponse,
  ApiSnapshot,
  ApiVmHardwareConfig,
  CreateVMParams,
  VmResources,
} from "../types/vm-types"
import type { ApiVmMutationResult } from "@/features/inventory/types/inventory-types"
import type { ApiRequestDetail } from "@/features/requests/types/request-types"
import { apiFetch } from "@/features/auth/api/auth-queries"

async function fetchVmStatuses(): Promise<Record<number, string>> {
  const res = await apiFetch("/api/v1/vms/status")
  if (!res.ok) throw new Error(`Failed to fetch VM statuses: ${res.status}`)
  return res.json()
}

export const vmStatusQueryOptions = {
  queryKey: ["vms", "status"] as const,
  queryFn: fetchVmStatuses,
}

async function fetchVmResources(itemId: string): Promise<VmResources> {
  const res = await apiFetch(`/api/v1/inventory/items/${itemId}/vm/resources`)
  if (!res.ok) throw new Error(`Failed to fetch VM resources: ${res.status}`)
  return res.json()
}

export function vmResourcesQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "resources"] as const,
    queryFn: () => fetchVmResources(itemId),
    refetchInterval: 10_000,
    enabled: !!itemId,
  }
}

export async function vmPowerAction(params: {
  itemIds: Array<string>
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms/power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: params.action,
      item_ids: params.itemIds,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to ${params.action} selected VMs: ${res.status}`
    )
  }

  return res.json()
}

export async function submitInventoryPowerRequest(params: {
  itemId: string
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/power`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit power request: ${res.status}`
    )
  }

  return res.json()
}

export async function deleteVM(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: params.itemIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to delete selected VMs: ${res.status}`
    )
  }

  return res.json()
}

export async function renameVM(params: {
  itemId: string
  name: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: params.name }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rename VM: ${res.status}`)
  }
}

export async function updateVMNotes(params: {
  itemId: string
  notes: string
}): Promise<{ synced: boolean }> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/notes`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: params.notes }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VM notes: ${res.status}`)
  }
  return res.json()
}

export function vmHardwareQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "hardware"] as const,
    queryFn: async (): Promise<ApiVmHardwareConfig> => {
      const res = await apiFetch(
        `/api/v1/inventory/items/${itemId}/vm/hardware`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch VM hardware: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: !!itemId,
  }
}

export async function updateVMHardware(params: {
  itemId: string
  hardware: ApiVmHardwareConfig
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/hardware`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.hardware),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VM hardware: ${res.status}`)
  }
}

export async function cloneVM(params: {
  itemId: string
  newid: number
  name: string
  full: boolean
  target?: string
  target_folder_id: string
}): Promise<ApiVmMutationResult> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newid: params.newid,
        name: params.name,
        full: params.full,
        target: params.target,
        target_folder_id: params.target_folder_id,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to clone VM: ${res.status}`)
  }
  return res.json()
}

export async function convertToTemplate(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: params.itemIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to convert selected VMs to templates: ${res.status}`
    )
  }

  return res.json()
}

export function snapshotsQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "snapshots"] as const,
    queryFn: async (): Promise<Array<ApiSnapshot>> => {
      const res = await apiFetch(
        `/api/v1/inventory/items/${itemId}/vm/snapshots`
      )
      if (!res.ok) throw new Error(`Failed to fetch snapshots: ${res.status}`)
      return res.json()
    },
    enabled: !!itemId,
  }
}

export async function rollbackSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rollback snapshot: ${res.status}`)
  }
}

export async function submitInventorySnapshotRollbackRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit snapshot rollback request: ${res.status}`
    )
  }

  return res.json()
}

export async function deleteSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/${params.snapname}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete snapshot: ${res.status}`)
  }
}

export async function createSnapshot(params: {
  itemId: string
  snapname: string
  description?: string
  vmstate?: boolean
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapname: params.snapname,
        description: params.description,
        vmstate: params.vmstate,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create snapshot: ${res.status}`)
  }
}

export async function submitInventorySnapshotCreateRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit snapshot request: ${res.status}`
    )
  }

  return res.json()
}

export async function createVM(
  params: CreateVMParams
): Promise<ApiVmMutationResult> {
  const res = await apiFetch("/api/v1/vms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create VM: ${res.status}`)
  }
  return res.json()
}

export async function getNextVMID(): Promise<number> {
  const res = await apiFetch("/api/v1/proxmox/nextid")
  if (!res.ok) throw new Error(`Failed to fetch next VMID: ${res.status}`)
  const data = await res.json()
  return data.vmid
}

export async function validateVMID(vmid: number): Promise<boolean> {
  const res = await apiFetch(`/api/v1/proxmox/vmid/${vmid}/validate`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to validate VM ID: ${res.status}`)
  }
  const data = await res.json()
  return !!data.valid
}
