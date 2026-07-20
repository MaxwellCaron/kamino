import type { PublishPodFormValues } from "@/features/pods/components/publish/publish-pod-form"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
  PublishedPodVirtualMachine,
} from "@/features/pods/types/pod-types"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import { shouldRetryApiQuery } from "@/features/auth/api/auth-api"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export type PublishPodFolder = {
  id: string
  name: string
  path: string
  network_profile_key: string
  virtual_machines: Array<PublishedPodVirtualMachine>
}

export type PublishPodOptions = {
  source_folders: Array<PublishPodFolder>
}

export type PublishPodProgress = {
  type: "pod.publish.progress"
  id: string
  state: "running" | "success" | "error"
  step_id: number
  message: string
  updated_at: string
}

export function publishPodOptionsQueryOptions(publishedPodId?: string) {
  return {
    queryKey: ["pods", "publish", "options", publishedPodId] as const,
    queryFn: async (): Promise<PublishPodOptions> => {
      const params = new URLSearchParams()
      if (publishedPodId) {
        params.set("published_pod_id", publishedPodId)
      }
      const query = params.size > 0 ? `?${params.toString()}` : ""
      return apiJson<PublishPodOptions>(
        `/api/v1/pods/publish/options${query}`,
        "fetch publish options"
      )
    },
  }
}

function getPublishProgressRefetchInterval(query: {
  state: { data?: PublishPodProgress }
}) {
  return query.state.data?.state === "running" ? 750 : false
}

export function publishedPodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "published", "progress", progressId] as const,
    queryFn: (): Promise<PublishPodProgress> =>
      apiJson<PublishPodProgress>(
        `/api/v1/pods/published/progress/${encodeURIComponent(progressId ?? "")}`,
        "fetch publish progress"
      ),
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: getPublishProgressRefetchInterval,
  }
}

export const publishedPodsQueryOptions = {
  queryKey: ["pods", "published"] as const,
  queryFn: (): Promise<Array<PublishedPodCatalogEntry>> =>
    apiJson<Array<PublishedPodCatalogEntry>>(
      "/api/v1/pods/published",
      "fetch published pods"
    ),
}

export const podCatalogQueryOptions = {
  queryKey: ["pods", "catalog"] as const,
  queryFn: (): Promise<Array<PublishedPodCatalogEntry>> =>
    apiJson<Array<PublishedPodCatalogEntry>>(
      "/api/v1/pods/catalog",
      "fetch pod catalog"
    ),
}

export function podCatalogEntryQueryOptions(podSlug?: string) {
  return {
    queryKey: ["pods", "catalog", podSlug] as const,
    queryFn: (): Promise<PublishedPodCatalogEntry> =>
      apiJson<PublishedPodCatalogEntry>(
        `/api/v1/pods/catalog/${podSlug}`,
        "fetch pod"
      ),
    enabled: !!podSlug,
    retry: shouldRetryApiQuery,
  }
}

export function publishedPodQueryOptions(podId?: string) {
  return {
    queryKey: ["pods", "published", podId] as const,
    queryFn: (): Promise<PublishedPodCatalogEntry> =>
      apiJson<PublishedPodCatalogEntry>(
        `/api/v1/pods/published/${podId}`,
        "fetch published pod"
      ),
    enabled: !!podId,
  }
}

export function publishedPodClonesQueryOptions(podId?: string) {
  return {
    queryKey: ["pods", "published", podId, "clones"] as const,
    queryFn: (): Promise<Array<PublishedPodCloneSummary>> =>
      apiJson<Array<PublishedPodCloneSummary>>(
        `/api/v1/pods/published/${podId}/clones`,
        "fetch published pod clones"
      ),
    enabled: !!podId,
  }
}

export async function powerPublishedPodClone(params: {
  podId: string
  clonedPodId: string
  action: ClonedPodPowerAction
}): Promise<PublishedPodCloneSummary> {
  return apiJson<PublishedPodCloneSummary>(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}/power`,
    `${params.action} cloned pod`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
}

export async function deletePublishedPodClone(params: {
  podId: string
  clonedPodId: string
}): Promise<void> {
  await apiVoid(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}`,
    "delete cloned pod",
    { method: "DELETE" }
  )
}

export async function reclonePublishedPodClone(params: {
  podId: string
  clonedPodId: string
}): Promise<PublishedPodCloneSummary> {
  return apiJson<PublishedPodCloneSummary>(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}/reclone`,
    "re-clone cloned pod",
    { method: "POST" }
  )
}

export type CreatePublishedPodCloneParams = {
  podId: string
  principalId: string
  progressId: string
  progressBatchId: string
}

export async function createPublishedPodClone(
  params: CreatePublishedPodCloneParams
): Promise<PublishedPodCloneSummary> {
  return apiJson<PublishedPodCloneSummary>(
    `/api/v1/pods/published/${params.podId}/clones`,
    "clone pod for principal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        principal_id: params.principalId,
        progress_id: params.progressId,
        progress_batch_id: params.progressBatchId,
      }),
    }
  )
}

export async function savePublishedPod(
  values: PublishPodFormValues,
  options?: { existing?: boolean; progressId?: string }
): Promise<PublishedPodCatalogEntry> {
  const isExisting = options?.existing ?? false
  const progressParam = options?.progressId
    ? `?progress_id=${encodeURIComponent(options.progressId)}`
    : ""
  return apiJson<PublishedPodCatalogEntry>(
    `${
      isExisting
        ? `/api/v1/pods/published/${values.id}`
        : "/api/v1/pods/published"
    }${progressParam}`,
    "save published pod",
    {
      method: isExisting ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  )
}

export async function setPublishedPodStatus(params: {
  id: string
  status: PublishedPodCatalogEntry["status"]
}): Promise<PublishedPodCatalogEntry> {
  return apiJson<PublishedPodCatalogEntry>(
    `/api/v1/pods/published/${params.id}/status`,
    "update published pod status",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: params.status }),
    }
  )
}

export async function deletePublishedPod(id: string): Promise<void> {
  await apiVoid(`/api/v1/pods/published/${id}`, "delete published pod", {
    method: "DELETE",
  })
}

export function toPublishPodFormValues(
  pod: PublishedPodCatalogEntry
): PublishPodFormValues {
  return {
    id: pod.id,
    title: pod.title,
    slug: pod.slug,
    description: pod.description,
    image: pod.image,
    creators: structuredClone(pod.creators),
    created_at: pod.created_at,
    clone_count: pod.clone_count,
    status: pod.status,
    audience: structuredClone(pod.audience),
    virtual_machines: structuredClone(pod.virtual_machines),
    update_virtual_machines: [],
    tasks: (pod.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      content: task.content,
      questions: (task.questions ?? []).map((question) => ({
        id: question.id,
        title: question.title,
        answerOutline: question.answerOutline ?? "",
        description: question.description,
        hint: question.hint,
      })),
    })),
    source_folder: pod.source_folder,
  }
}
