import type {
  ApiBulkVmMutationResponse,
  ApiSnapshot,
  ApiVmHardwareConfig,
  ApiVmHardwareUpdate,
  ApiVmOverviewResponse,
  CreateVMParams,
  VmResources,
} from "../types/vm-types"
import type { ApiVmMutationResult } from "@/features/inventory/types/inventory-types"
import type { ApiRequestDetail } from "@/features/requests/types/request-types"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

async function fetchVmStatuses(): Promise<Record<number, string>> {
  return apiJson<Record<number, string>>(
    "/api/v1/vms/status",
    "fetch VM statuses"
  )
}

export const vmStatusQueryOptions = {
  queryKey: ["vms", "status"] as const,
  queryFn: fetchVmStatuses,
}

async function fetchVmResources(itemId: string): Promise<VmResources> {
  return apiJson<VmResources>(
    `/api/v1/inventory/items/${itemId}/vm/resources`,
    "fetch VM resources"
  )
}

export function vmResourcesQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "resources"] as const,
    queryFn: () => fetchVmResources(itemId),
    refetchInterval: 10_000,
    staleTime: 10_000,
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

  return apiJson<ApiBulkVmMutationResponse>(
    `/api/v1/inventory/vms/power`,
    `${params.action} selected VMs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: params.action,
        item_ids: params.itemIds,
      }),
    }
  )
}

export async function submitInventoryPowerRequest(params: {
  itemId: string
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<ApiRequestDetail> {
  return apiJson<ApiRequestDetail>(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/power`,
    "submit power request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
}

export async function deleteVM(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  return apiJson<ApiBulkVmMutationResponse>(
    `/api/v1/inventory/vms`,
    "delete selected VMs",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: params.itemIds }),
    }
  )
}

export async function renameVM(params: {
  itemId: string
  name: string
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/items/${params.itemId}/vm/rename`,
    "rename VM",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: params.name }),
    }
  )
}

export async function updateVMNotes(params: {
  itemId: string
  notes: string
}): Promise<{ synced: boolean }> {
  return apiJson<{ synced: boolean }>(
    `/api/v1/inventory/items/${params.itemId}/vm/notes`,
    "update VM notes",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: params.notes }),
    }
  )
}

export function vmHardwareQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "hardware"] as const,
    queryFn: (): Promise<ApiVmHardwareConfig> =>
      apiJson<ApiVmHardwareConfig>(
        `/api/v1/inventory/items/${itemId}/vm/hardware`,
        "fetch VM hardware"
      ),
    enabled: !!itemId,
  }
}

export function vmOverviewQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "overview"] as const,
    queryFn: (): Promise<ApiVmOverviewResponse> =>
      apiJson<ApiVmOverviewResponse>(
        `/api/v1/inventory/items/${itemId}/vm/overview`,
        "fetch VM overview"
      ),
    enabled: !!itemId,
  }
}

export async function updateVMHardware(params: {
  itemId: string
  hardware: ApiVmHardwareUpdate
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/items/${params.itemId}/vm/hardware`,
    "update VM hardware",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.hardware),
    }
  )
}

export async function cloneVM(params: {
  itemId: string
  newid: number
  name: string
  full: boolean
  target?: string
  target_folder_id: string
}): Promise<ApiVmMutationResult> {
  return apiJson<ApiVmMutationResult>(
    `/api/v1/inventory/items/${params.itemId}/vm/clone`,
    "clone VM",
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
}

export async function convertToTemplate(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  return apiJson<ApiBulkVmMutationResponse>(
    `/api/v1/inventory/vms/template`,
    "convert selected VMs to templates",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: params.itemIds }),
    }
  )
}

export function snapshotsQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "snapshots"] as const,
    queryFn: (): Promise<Array<ApiSnapshot>> =>
      apiJson<Array<ApiSnapshot>>(
        `/api/v1/inventory/items/${itemId}/vm/snapshots`,
        "fetch snapshots"
      ),
    enabled: !!itemId,
  }
}

export async function rollbackSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    "rollback snapshot",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
}

export async function submitInventorySnapshotRollbackRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  return apiJson<ApiRequestDetail>(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    "submit snapshot rollback request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
}

export async function deleteSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/${params.snapname}`,
    "delete snapshot",
    { method: "DELETE" }
  )
}

export async function createSnapshot(params: {
  itemId: string
  snapname: string
  description?: string
  vmstate?: boolean
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots`,
    "create snapshot",
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
}

export async function submitInventorySnapshotCreateRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  return apiJson<ApiRequestDetail>(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots`,
    "submit snapshot request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
}

export async function createVM(
  params: CreateVMParams
): Promise<ApiVmMutationResult> {
  return apiJson<ApiVmMutationResult>("/api/v1/vms", "create VM", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
}

export async function validateVMID(vmid: number): Promise<boolean> {
  const data = await apiJson<{ valid: boolean }>(
    `/api/v1/proxmox/vmid/${vmid}/validate`,
    "validate VM ID"
  )
  return !!data.valid
}
