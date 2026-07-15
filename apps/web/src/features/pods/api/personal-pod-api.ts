import { shouldRetryApiQuery } from "@/features/auth/api/auth-api"
import { apiJson } from "@/features/shared/api/api-json"

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
  return apiJson<PersonalPodStatus>(
    "/api/v1/pods/personal",
    "fetch personal pod status"
  )
}

export const personalPodQueryOptions = {
  queryKey: ["pods", "personal"] as const,
  queryFn: fetchPersonalPodStatus,
  retry: shouldRetryApiQuery,
}

export async function createPersonalPod(): Promise<{ folder_id: string }> {
  return apiJson<{ folder_id: string }>(
    "/api/v1/pods/personal",
    "create personal pod",
    { method: "POST" }
  )
}

export async function requestPersonalPod(): Promise<unknown> {
  return apiJson<unknown>("/api/v1/requests/personal-pod", "request personal pod", {
    method: "POST",
  })
}
