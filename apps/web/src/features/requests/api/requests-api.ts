import type {
  ApiRequestActionResponse,
  ApiRequestDetail,
  ApiRequestScope,
  ApiRequestSummary,
  ApiRequestTablePage,
  ApiRequesterRequestScope,
} from "../types/request-types"
import { apiJson } from "@/features/shared/api/api-json"

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
  return apiJson<ApiRequestTablePage>(
    `/api/v1/requests?${search}`,
    `fetch ${scope} requests`
  )
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
  return apiJson<ApiRequestTablePage>(
    `/api/v1/requests/mine?${search}`,
    `fetch your ${scope} requests`
  )
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
    queryFn: (): Promise<ApiRequestDetail> =>
      apiJson<ApiRequestDetail>(
        `/api/v1/requests/${requestId}`,
        "fetch request"
      ),
    enabled: !!requestId,
  }
}

export async function approveRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  return apiJson<ApiRequestActionResponse>(
    `/api/v1/requests/approve`,
    "approve requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: requestIds }),
    }
  )
}

export async function denyRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  return apiJson<ApiRequestActionResponse>(
    `/api/v1/requests/deny`,
    "deny requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: requestIds }),
    }
  )
}
