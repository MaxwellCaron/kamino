import { apiJson } from "@/features/shared/api/api-json"

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

async function fetchActionEvents(
  { pageIndex, pageSize, search }: ActionEventsQueryParams,
  signal?: AbortSignal
): Promise<ApiActionEventsListResponse> {
  const params = new URLSearchParams({
    page: String(pageIndex + 1),
    rows: String(pageSize),
  })
  if (search) params.set("search", search)

  return apiJson<ApiActionEventsListResponse>(
    `/api/v1/admin/audit/actions?${params}`,
    "fetch audit events",
    { signal }
  )
}

export function actionEventsQueryOptions(params: ActionEventsQueryParams) {
  return {
    queryKey: ["audit", "actions", params] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchActionEvents(params, signal),
  }
}
