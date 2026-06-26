import { apiFetch } from "@/features/auth/api/auth-api"

export type ApiActionEvent = {
  id: number
  actor_principal_id?: string
  actor_username: string
  action_kind: string
  target_kind: string
  inventory_item_id?: string
  inventory_item_name?: string
  pod_id?: string
  status: string
  error_message?: string
  created_at: string
}

export type ApiActionEventsListResponse = {
  items: Array<ApiActionEvent>
  total: number
  next_cursor?: number
}

async function fetchActionEvents(
  cursor?: number | null,
  pageSize = 50
): Promise<ApiActionEventsListResponse> {
  const search = new URLSearchParams()
  if (cursor != null) search.set("cursor", String(cursor))
  search.set("page_size", String(pageSize))

  const res = await apiFetch(`/api/v1/admin/audit/actions?${search}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch audit events: ${res.status}`)
  }
  return res.json()
}

export function actionEventsQueryOptions(pageSize = 50) {
  return {
    queryKey: ["audit", "actions", { pageSize }] as const,
    initialPageParam: null as number | null,
    queryFn: ({
      pageParam,
    }: {
      pageParam: number | null
    }): Promise<ApiActionEventsListResponse> =>
      fetchActionEvents(pageParam, pageSize),
    getNextPageParam: (lastPage: ApiActionEventsListResponse) =>
      lastPage.next_cursor ?? undefined,
  }
}
