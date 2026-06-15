import type { PublishPodFormValues } from "@/features/pods/components/publish/publish-pod-form"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
  PublishedPodVirtualMachine,
} from "@/features/pods/types/pod-types"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import {
  ApiError,
  apiFetch,
  shouldRetryApiQuery,
} from "@/features/auth/api/auth-api"

export type PublishedPodCloneBulkActionResponse = {
  action: PodCloneAction
  succeeded: Array<string>
  failed: Array<{
    id: string
    error: string
  }>
}

export type PublishPodFolder = {
  id: string
  name: string
  path: string
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
      const res = await apiFetch(`/api/v1/pods/publish/options${query}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch publish options: ${res.status}`
        )
      }
      return res.json()
    },
  }
}

export function publishedPodProgressQueryOptions(
  progressId: string | null | undefined,
  enabled: boolean
) {
  return {
    queryKey: ["pods", "published", "progress", progressId] as const,
    queryFn: async (): Promise<PublishPodProgress> => {
      const res = await apiFetch(
        `/api/v1/pods/published/progress/${encodeURIComponent(progressId ?? "")}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch publish progress: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: enabled && !!progressId,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchInterval: 750,
  }
}

export const publishedPodsQueryOptions = {
  queryKey: ["pods", "published"] as const,
  queryFn: async (): Promise<Array<PublishedPodCatalogEntry>> => {
    const res = await apiFetch("/api/v1/pods/published")
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        body.error ?? `Failed to fetch published pods: ${res.status}`
      )
    }
    return res.json()
  },
}

export const podCatalogQueryOptions = {
  queryKey: ["pods", "catalog"] as const,
  queryFn: async (): Promise<Array<PublishedPodCatalogEntry>> => {
    const res = await apiFetch("/api/v1/pods/catalog")
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        body.error ?? `Failed to fetch pod catalog: ${res.status}`
      )
    }
    return res.json()
  },
}

export function podCatalogEntryQueryOptions(podSlug?: string) {
  return {
    queryKey: ["pods", "catalog", podSlug] as const,
    queryFn: async (): Promise<PublishedPodCatalogEntry> => {
      const res = await apiFetch(`/api/v1/pods/catalog/${podSlug}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(
          body.error ?? `Failed to fetch pod: ${res.status}`,
          res.status
        )
      }
      return res.json()
    },
    enabled: !!podSlug,
    retry: shouldRetryApiQuery,
  }
}

export function publishedPodQueryOptions(podId?: string) {
  return {
    queryKey: ["pods", "published", podId] as const,
    queryFn: async (): Promise<PublishedPodCatalogEntry> => {
      const res = await apiFetch(`/api/v1/pods/published/${podId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch published pod: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: !!podId,
  }
}

export function publishedPodClonesQueryOptions(podId?: string) {
  return {
    queryKey: ["pods", "published", podId, "clones"] as const,
    queryFn: async (): Promise<Array<PublishedPodCloneSummary>> => {
      const res = await apiFetch(`/api/v1/pods/published/${podId}/clones`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch published pod clones: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: !!podId,
  }
}

export async function powerPublishedPodClone(params: {
  podId: string
  clonedPodId: string
  action: ClonedPodPowerAction
}): Promise<PublishedPodCloneSummary> {
  const res = await apiFetch(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}/power`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ??
        `Failed to ${params.action} cloned pod: ${res.status}`
    )
  }
  return res.json()
}

export async function deletePublishedPodClone(params: {
  podId: string
  clonedPodId: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to delete cloned pod: ${res.status}`
    )
  }
}

export async function reclonePublishedPodClone(params: {
  podId: string
  clonedPodId: string
}): Promise<PublishedPodCloneSummary> {
  const res = await apiFetch(
    `/api/v1/pods/published/${params.podId}/clones/${params.clonedPodId}/reclone`,
    { method: "POST" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to re-clone cloned pod: ${res.status}`)
  }
  return res.json()
}

export async function bulkActionPublishedPodClones(params: {
  podId: string
  action: PodCloneAction
}): Promise<PublishedPodCloneBulkActionResponse> {
  const res = await apiFetch(
    `/api/v1/pods/published/${params.podId}/clone-actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to apply bulk clone action: ${res.status}`
    )
  }
  return res.json()
}

export async function savePublishedPod(
  values: PublishPodFormValues,
  options?: { existing?: boolean; progressId?: string }
): Promise<PublishedPodCatalogEntry> {
  const isExisting = options?.existing ?? false
  const progressParam = options?.progressId
    ? `?progress_id=${encodeURIComponent(options.progressId)}`
    : ""
  const res = await apiFetch(
    `${
      isExisting
        ? `/api/v1/pods/published/${values.id}`
        : "/api/v1/pods/published"
    }${progressParam}`,
    {
      method: isExisting ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to save published pod: ${res.status}`)
  }
  return res.json()
}

export async function setPublishedPodStatus(params: {
  id: string
  status: PublishedPodCatalogEntry["status"]
}): Promise<PublishedPodCatalogEntry> {
  const res = await apiFetch(`/api/v1/pods/published/${params.id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: params.status }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to update published pod status: ${res.status}`
    )
  }
  return res.json()
}

export async function deletePublishedPod(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/pods/published/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to delete published pod: ${res.status}`
    )
  }
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
