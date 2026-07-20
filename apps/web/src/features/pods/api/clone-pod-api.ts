import type {
  ClonedPod,
  ClonedPodStatus,
  PodQuestionActivityAnswer,
} from "@/features/pods/types/pod-types"
import { shouldRetryApiQuery } from "@/features/auth/api/auth-api"
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

export type ClonePodProgressBatchChild = ClonePodProgress & {
  batch_id: string
}

export type ClonePodProgressBatch = {
  id: string
  items: Array<ClonePodProgressBatchChild>
}

export function clonedPodQueryOptions(podSlug?: string) {
  return {
    queryKey: ["pods", "catalog", podSlug, "clone"] as const,
    queryFn: (): Promise<ClonedPod | null> =>
      apiJson<ClonedPod | null>(
        `/api/v1/pods/catalog/${podSlug}/clone`,
        "fetch cloned pod"
      ),
    enabled: !!podSlug,
    retry: shouldRetryApiQuery,
  }
}

export function catalogCloneSummariesQueryOptions() {
  return {
    queryKey: ["pods", "catalog", "clones", "summary"] as const,
    queryFn: (): Promise<Array<CatalogCloneSummary>> =>
      apiJson<Array<CatalogCloneSummary>>(
        "/api/v1/pods/catalog/clones/summary",
        "fetch catalog clone summaries"
      ),
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
      fetchClonePodProgress(progressId ?? ""),
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: 750,
  }
}

export async function fetchClonePodProgress(
  progressId: string
): Promise<ClonePodProgress> {
  return apiJson<ClonePodProgress>(
    `/api/v1/pods/clones/progress/${encodeURIComponent(progressId)}`,
    "fetch clone progress"
  )
}

export async function fetchClonePodProgressBatch(
  batchId: string
): Promise<ClonePodProgressBatch> {
  return apiJson<ClonePodProgressBatch>(
    `/api/v1/pods/clones/progress-batches/${encodeURIComponent(batchId)}`,
    "fetch clone progress batch"
  )
}

export function podQuestionActivityQueryOptions() {
  return {
    queryKey: ["pods", "question-activity"] as const,
    queryFn: (): Promise<Array<PodQuestionActivityAnswer>> =>
      apiJson<Array<PodQuestionActivityAnswer>>(
        "/api/v1/pods/question-activity",
        "fetch pod question activity"
      ),
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
