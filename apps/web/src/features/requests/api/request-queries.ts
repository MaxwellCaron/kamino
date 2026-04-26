import type {
  ApiRequestActionResponse,
  ApiRequestDetail,
  ApiRequestScope,
  ApiRequestSummary,
} from "../types/request-types"
import { apiFetch } from "@/features/auth/api/auth-queries"

export function requestsQueryOptions(scope: ApiRequestScope) {
  return {
    queryKey: ["requests", scope] as const,
    queryFn: async (): Promise<Array<ApiRequestSummary>> => {
      const res = await apiFetch(`/api/v1/requests?scope=${scope}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch ${scope} requests: ${res.status}`)
      }
      return res.json()
    },
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
