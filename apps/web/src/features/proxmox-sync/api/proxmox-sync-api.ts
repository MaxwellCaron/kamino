import { apiJson } from "@/features/shared/api/api-json"

export type SyncChangeKind = "add" | "remove" | "update"

export type SyncFieldChange = {
  field: string
  from: string
  to: string
}

export type SyncChange = {
  id: string
  kind: SyncChangeKind
  node: string
  vmid: number
  name: string
  is_template: boolean
  fields?: Array<SyncFieldChange>
  removable?: boolean
  blockers?: Array<string>
}

export type SyncDiff = {
  adds: Array<SyncChange>
  removes: Array<SyncChange>
  updates: Array<SyncChange>
  proxmox_vm_count: number
  warning?: string
}

export type SyncSelection = {
  add_ids: Array<string>
  remove_ids: Array<string>
  update_ids: Array<string>
}

export type SyncApplyResult = {
  id: string
  kind: string
  status: "success" | "error" | "skipped"
  error?: string
}

export type SyncApplyResponse = {
  results: Array<SyncApplyResult>
  applied: number
  failed: number
  skipped: number
}

export const proxmoxSyncPreviewQueryOptions = {
  queryKey: ["proxmox", "sync", "preview"] as const,
  queryFn: (): Promise<SyncDiff> =>
    apiJson<SyncDiff>(
      "/api/v1/admin/proxmox/sync/preview",
      "fetch sync preview"
    ),
  staleTime: 0,
}

export async function applyProxmoxSync(
  selection: SyncSelection
): Promise<SyncApplyResponse> {
  return apiJson<SyncApplyResponse>(
    "/api/v1/admin/proxmox/sync/apply",
    "apply sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    }
  )
}
