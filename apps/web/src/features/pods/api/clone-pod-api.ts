import type {
  ClonedPod,
  ClonedPodStatus,
  PodQuestionActivityAnswer,
} from "@/features/pods/types/pod-types"
import {
  ApiError,
  apiFetch,
  shouldRetryApiQuery,
} from "@/features/auth/api/auth-api"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export type CatalogCloneSummary = {
  summary: {
    id: string
    pod_id: string
    cloned_at: string
    status: ClonedPodStatus
    task_summary: {
      total: number
      completed: number
      progress: number
    }
  }
  pod: {
    id: string
    slug: string
    title: string
    description: string
    image_url: string
  }
}

export type ClonePodProgress = {
  type: "pod.clone.progress"
  id: string
  state: "running" | "success" | "error"
  step_id: number
  message: string
  updated_at: string
}

export function clonedPodQueryOptions(podSlug?: string) {
  return {
    queryKey: ["pods", "catalog", podSlug, "clone"] as const,
    queryFn: async (): Promise<ClonedPod | null> => {
      const res = await apiFetch(`/api/v1/pods/catalog/${podSlug}/clone`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(
          body.error ?? `Failed to fetch cloned pod: ${res.status}`,
          res.status
        )
      }
      return res.json()
    },
    enabled: !!podSlug,
    retry: shouldRetryApiQuery,
  }
}

export function catalogCloneSummariesQueryOptions() {
  return {
    queryKey: ["pods", "catalog", "clones", "summary"] as const,
    queryFn: async (): Promise<Array<CatalogCloneSummary>> => {
      const res = await apiFetch("/api/v1/pods/catalog/clones/summary")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(
          body.error ??
            `Failed to fetch catalog clone summaries: ${res.status}`,
          res.status
        )
      }
      return res.json()
    },
    retry: shouldRetryApiQuery,
  }
}

export function clonePodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "clone", "progress", progressId] as const,
    queryFn: (): Promise<ClonePodProgress> =>
      apiJson<ClonePodProgress>(
        `/api/v1/pods/clones/progress/${encodeURIComponent(progressId ?? "")}`,
        "fetch clone progress"
      ),
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: 750,
  }
}

export function podQuestionActivityQueryOptions() {
  return {
    queryKey: ["pods", "question-activity"] as const,
    queryFn: async (): Promise<Array<PodQuestionActivityAnswer>> => {
      const res = await apiFetch("/api/v1/pods/question-activity")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(
          body.error ?? `Failed to fetch pod question activity: ${res.status}`,
          res.status
        )
      }
      return res.json()
    },
    retry: shouldRetryApiQuery,
  }
}

export async function clonePod(params: {
  podSlug: string
  progressId: string
}): Promise<ClonedPod> {
  return apiJson<ClonedPod>(
    `/api/v1/pods/catalog/${params.podSlug}/clone?progress_id=${encodeURIComponent(params.progressId)}`,
    "clone pod",
    { method: "POST" }
  )
}

export async function reclonePod(params: {
  clonedPodId: string
  progressId: string
}): Promise<ClonedPod> {
  return apiJson<ClonedPod>(
    `/api/v1/pods/clones/${params.clonedPodId}/reclone?progress_id=${encodeURIComponent(params.progressId)}`,
    "re-clone pod",
    { method: "POST" }
  )
}

export async function answerClonedPodQuestion(params: {
  clonedPodId: string
  questionId: string
  answer: string
}): Promise<ClonedPod> {
  return apiJson<ClonedPod>(
    `/api/v1/pods/clones/${params.clonedPodId}/questions/${params.questionId}`,
    "save answer",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: params.answer }),
    }
  )
}

export type ClonedPodPowerAction = "start" | "shutdown"

export async function powerClonedPod(params: {
  clonedPodId: string
  action: ClonedPodPowerAction
}): Promise<ClonedPod> {
  return apiJson<ClonedPod>(
    `/api/v1/pods/clones/${params.clonedPodId}/power`,
    `${params.action} cloned pod`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
}

export async function deleteClonedPod(params: {
  clonedPodId: string
}): Promise<void> {
  await apiVoid(`/api/v1/pods/clones/${params.clonedPodId}`, "delete cloned pod", {
    method: "DELETE",
  })
}
