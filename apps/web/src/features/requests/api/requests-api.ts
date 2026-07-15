import type {
  ApiManagerRequestStatusCounts,
  ApiRequestActionResponse,
  ApiRequestDetail,
  ApiRequestScope,
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

function requestSummaryPageQueryOptions(scope: ApiRequestScope, rows = 50) {
  return {
    queryKey: ["requests", scope, "summaries", { rows }] as const,
    queryFn: () =>
      fetchRequestsTablePage(scope, {
        pageIndex: 0,
        pageSize: rows,
        search: "",
      }),
  }
}

/**
 * Bounded page of request summaries for non-table consumers (dashboards,
 * command palette). Shares cache with {@link requestSummaryCountQueryOptions}.
 */
export function requestSummariesQueryOptions(
  scope: ApiRequestScope,
  rows = 50
) {
  return {
    ...requestSummaryPageQueryOptions(scope, rows),
    select: (page: ApiRequestTablePage) => page.items,
  }
}

/** Authoritative total for a manager request scope summary query. */
export function requestSummaryCountQueryOptions(
  scope: ApiRequestScope,
  rows = 50
) {
  return {
    ...requestSummaryPageQueryOptions(scope, rows),
    select: (page: ApiRequestTablePage) => page.total,
  }
}

async function fetchManagerRequestStatusCounts(): Promise<ApiManagerRequestStatusCounts> {
  return apiJson<ApiManagerRequestStatusCounts>(
    "/api/v1/requests/counts",
    "fetch manager request counts"
  )
}

export function managerRequestStatusCountsQueryOptions() {
  return {
    queryKey: ["requests", "counts"] as const,
    queryFn: fetchManagerRequestStatusCounts,
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

function requesterRequestSummaryPageQueryOptions(
  scope: ApiRequesterRequestScope,
  rows = 50
) {
  return {
    queryKey: ["requests", "mine", scope, "summaries", { rows }] as const,
    queryFn: () =>
      fetchRequesterRequestsTablePage(scope, {
        pageIndex: 0,
        pageSize: rows,
        search: "",
      }),
  }
}

export function requesterRequestSummariesQueryOptions(
  scope: ApiRequesterRequestScope,
  rows = 50
) {
  return {
    ...requesterRequestSummaryPageQueryOptions(scope, rows),
    select: (page: ApiRequestTablePage) => page.items,
  }
}

/** Authoritative total for a requester scope summary query. */
export function requesterRequestSummaryCountQueryOptions(
  scope: ApiRequesterRequestScope,
  rows = 50
) {
  return {
    ...requesterRequestSummaryPageQueryOptions(scope, rows),
    select: (page: ApiRequestTablePage) => page.total,
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
