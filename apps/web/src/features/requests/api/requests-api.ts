import type {
  ApiRequestActionResponse,
  ApiRequestDetail,
  ApiRequestScope,
  ApiRequestSummary,
  ApiRequestTablePage,
  ApiRequesterRequestScope,
} from "../types/request-types"
import { apiFetch } from "@/features/auth/api/auth-api"

type RequestTableQueryParams = {
  pageIndex: number
  pageSize: number
  search: string
}

function tableSearchParams(
  scope: string,
  { pageIndex, pageSize, search }: RequestTableQueryParams
) {
  const search_ = new URLSearchParams({
    scope,
    page: String(pageIndex + 1),
    rows: String(pageSize),
  })
  if (search) search_.set("search", search)
  return search_
}

async function fetchRequestsTablePage(
  scope: ApiRequestScope,
  params: RequestTableQueryParams
): Promise<ApiRequestTablePage> {
  const search = tableSearchParams(scope, params)
  const res = await apiFetch(`/api/v1/requests?${search}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${scope} requests: ${res.status}`)
  }
  return res.json()
}

export function requestsTableQueryOptions(
  scope: ApiRequestScope,
  params: RequestTableQueryParams
) {
  return {
    queryKey: ["requests", scope, "table", params] as const,
    queryFn: () => fetchRequestsTablePage(scope, params),
  }
}

async function fetchRequesterRequestsTablePage(
  scope: ApiRequesterRequestScope,
  params: RequestTableQueryParams
): Promise<ApiRequestTablePage> {
  const search = tableSearchParams(scope, params)
  const res = await apiFetch(`/api/v1/requests/mine?${search}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch your ${scope} requests: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetches a single bounded page of request summaries and returns only the
 * `items`. For non-table consumers (dashboards, the command palette) that
 * need a small, fixed-size list rather than full table pagination.
 */
async function fetchRequestSummaries(
  scope: ApiRequestScope,
  rows: number
): Promise<Array<ApiRequestSummary>> {
  const page = await fetchRequestsTablePage(scope, {
    pageIndex: 0,
    pageSize: rows,
    search: "",
  })
  return page.items
}

export function requestSummariesQueryOptions(
  scope: ApiRequestScope,
  rows = 50
) {
  return {
    queryKey: ["requests", scope, "summaries", { rows }] as const,
    queryFn: () => fetchRequestSummaries(scope, rows),
  }
}

async function fetchRequesterRequestSummaries(
  scope: ApiRequesterRequestScope,
  rows: number
): Promise<Array<ApiRequestSummary>> {
  const page = await fetchRequesterRequestsTablePage(scope, {
    pageIndex: 0,
    pageSize: rows,
    search: "",
  })
  return page.items
}

export function requesterRequestSummariesQueryOptions(
  scope: ApiRequesterRequestScope,
  rows = 50
) {
  return {
    queryKey: ["requests", "mine", scope, "summaries", { rows }] as const,
    queryFn: () => fetchRequesterRequestSummaries(scope, rows),
  }
}

export function requestDetailQueryOptions(requestId: string) {
  return {
    queryKey: ["requests", requestId] as const,
    queryFn: async (): Promise<ApiRequestDetail> => {
      const res = await apiFetch(`/api/v1/requests/${requestId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch request: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!requestId,
  }
}

export async function approveRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  const res = await apiFetch(`/api/v1/requests/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: requestIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to approve requests: ${res.status}`)
  }

  return res.json()
}

export async function denyRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  const res = await apiFetch(`/api/v1/requests/deny`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: requestIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to deny requests: ${res.status}`)
  }

  return res.json()
}
