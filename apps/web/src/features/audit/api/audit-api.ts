import { apiFetch } from "@/features/auth/api/auth-api"

export type ApiActionEvent = {
  id: number
  actor_principal_id?: string
  actor_username: string
  action_kind: string
  target_kind: string
  inventory_item_id?: string
  inventory_item_name?: string
  inventory_item_parent_id?: string
  inventory_item_parent_name?: string
  inventory_item_path?: string
  inventory_vm_node?: string
  inventory_vm_vmid?: number
  pod_id?: string
  pod_title?: string
  pod_slug?: string
  pod_folder_path?: string
  status: string
  error_message?: string
  created_at: string
}

export type ApiActionEventsListResponse = {
  items: Array<ApiActionEvent>
  total: number
  page: number
  rows: number
}

type ActionEventsQueryParams = {
  pageIndex: number
  pageSize: number
  search: string
}

async function fetchActionEvents({
  pageIndex,
  pageSize,
  search,
}: ActionEventsQueryParams): Promise<ApiActionEventsListResponse> {
  const params = new URLSearchParams({
    page: String(pageIndex + 1),
    rows: String(pageSize),
  })
  if (search) params.set("search", search)

  const res = await apiFetch(`/api/v1/admin/audit/actions?${params}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch audit events: ${res.status}`)
  }
  return res.json()
}

export function actionEventsQueryOptions(params: ActionEventsQueryParams) {
  return {
    queryKey: ["audit", "actions", params] as const,
    queryFn: () => fetchActionEvents(params),
  }
}
