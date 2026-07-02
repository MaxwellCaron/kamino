import {
  ApiError,
  apiFetch,
  shouldRetryApiQuery,
} from "@/features/auth/api/auth-api"

export type PersonalPodStatus = {
  configured: boolean
  can_create: boolean
  personal_pod: {
    id: string
    folder_id: string
    network: {
      number: number
      vnet: string
      external_subnet: string
      external_gateway: string
      internal_subnet: string
      internal_gateway: string
    }
  } | null
  pending_request_id: string | null
}

async function fetchPersonalPodStatus(): Promise<PersonalPodStatus> {
  const res = await apiFetch("/api/v1/pods/personal")
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      body.error ?? `Failed to fetch personal pod status: ${res.status}`,
      res.status
    )
  }
  return res.json()
}

export const personalPodQueryOptions = {
  queryKey: ["pods", "personal"] as const,
  queryFn: fetchPersonalPodStatus,
  retry: shouldRetryApiQuery,
}

export async function createPersonalPod(): Promise<{ folder_id: string }> {
  const res = await apiFetch("/api/v1/pods/personal", { method: "POST" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      body.error ?? `Failed to create personal pod: ${res.status}`,
      res.status
    )
  }
  return res.json()
}

export async function requestPersonalPod(): Promise<unknown> {
  const res = await apiFetch("/api/v1/requests/personal-pod", {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      body.error ?? `Failed to request personal pod: ${res.status}`,
      res.status
    )
  }
  return res.json()
}
