import type { Query } from "@tanstack/react-query"
import type { ClonedPod } from "@/features/pods/types/pod-types"
import { apiFetch } from "@/features/auth/api/auth-api"

export type ClonePodProgress = {
  type: "pod.clone.progress"
  id: string
  state: "running" | "success" | "error"
  step_id: number
  message: string
  updated_at: string
}

type ClonePodProgressQueryKey = readonly [
  "pods",
  "clone",
  "progress",
  string | null | undefined,
]

export function clonedPodQueryOptions(podSlug?: string) {
  return {
    queryKey: ["pods", "catalog", podSlug, "clone"] as const,
    queryFn: async (): Promise<ClonedPod | null> => {
      const res = await apiFetch(`/api/v1/pods/catalog/${podSlug}/clone`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch cloned pod: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: !!podSlug,
  }
}

export function clonePodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "clone", "progress", progressId] as const,
    queryFn: async (): Promise<ClonePodProgress> => {
      const res = await apiFetch(
        `/api/v1/pods/clones/progress/${encodeURIComponent(progressId ?? "")}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch clone progress: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: enabled && !!progressId,
    refetchInterval: (
      query: Query<
        ClonePodProgress,
        Error,
        ClonePodProgress,
        ClonePodProgressQueryKey
      >
    ) => {
      const state = query.state.data?.state
      return state === "success" || state === "error" ? false : 750
    },
  }
}

export async function clonePod(params: {
  podSlug: string
  progressId: string
}): Promise<ClonedPod> {
  const res = await apiFetch(
    `/api/v1/pods/catalog/${params.podSlug}/clone?progress_id=${encodeURIComponent(params.progressId)}`,
    { method: "POST" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to clone pod: ${res.status}`)
  }
  return res.json()
}

export async function answerClonedPodQuestion(params: {
  clonedPodId: string
  questionId: string
  answer: string
}): Promise<ClonedPod> {
  const res = await apiFetch(
    `/api/v1/pods/clones/${params.clonedPodId}/questions/${params.questionId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: params.answer }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to save answer: ${res.status}`)
  }
  return res.json()
}

export type ClonedPodPowerAction = "start" | "shutdown"

export async function powerClonedPod(params: {
  clonedPodId: string
  action: ClonedPodPowerAction
}): Promise<ClonedPod> {
  const res = await apiFetch(
    `/api/v1/pods/clones/${params.clonedPodId}/power`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to ${params.action} cloned pod: ${res.status}`
    )
  }
  return res.json()
}

export async function deleteClonedPod(params: {
  clonedPodId: string
}): Promise<void> {
  const res = await apiFetch(`/api/v1/pods/clones/${params.clonedPodId}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete cloned pod: ${res.status}`)
  }
}
