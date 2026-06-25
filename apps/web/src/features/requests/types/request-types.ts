export type ApiRequestScope = "pending" | "completed"
export type ApiRequesterRequestScope = "pending" | "history"

export type ApiRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "executed"
  | "execution_failed"

export type ApiRequestInventoryPayload = {
  item_id?: string | null
  item_name?: string | null
  item_kind?: "folder" | "vm" | null
  item_parent_id?: string | null
  vm_node?: string | null
  vmid?: number | null
  is_template?: boolean | null
  power_action?: string | null
  snapshot_name?: string | null
}

export type ApiRequestSummary = {
  id: string
  family: string
  kind: string
  status: ApiRequestStatus
  requester_principal_id: string
  requester_username: string
  reviewer_principal_id?: string | null
  reviewer_username?: string | null
  reviewed_at?: string | null
  executed_at?: string | null
  execution_error?: string | null
  created_at?: string | null
  updated_at?: string | null
  inventory?: ApiRequestInventoryPayload | null
}

export type ApiPaginatedRequests = {
  items: Array<ApiRequestSummary>
  next_cursor?: string | null
}

export type ApiRequestEvent = {
  id: number
  event_kind: string
  actor_principal_id?: string | null
  actor_username?: string | null
  from_status?: string | null
  to_status: string
  error_message?: string | null
  created_at?: string | null
}

export type ApiRequestDetail = ApiRequestSummary & {
  events: Array<ApiRequestEvent>
}

export type ApiRequestActionFailure = {
  id: string
  error: string
}

export type ApiRequestActionResponse = {
  processed: Array<string>
  failed: Array<ApiRequestActionFailure>
}
