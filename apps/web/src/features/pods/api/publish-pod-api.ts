import type { PublishPodFormValues } from "@/features/pods/components/publish/publish-pod-form"
import type {
  PublishedPodCatalogEntry,
  PublishedPodVirtualMachine,
} from "@/features/pods/types/pod-types"
import { apiFetch } from "@/features/auth/api/auth-api"

export type PublishPodSourceFolder = {
  id: string
  name: string
  path: string
  virtual_machines: Array<PublishedPodVirtualMachine>
}

export type PublishPodOptions = {
  source_folders: Array<PublishPodSourceFolder>
}

export type PublishPodProgress = {
  type: "pod.publish.progress"
  id: string
  state: "running" | "success" | "error"
  step_id: number
  total_vms: number
  completed_vms: number
  current_vm_name?: string
  message: string
  updated_at: string
}

export const publishPodOptionsQueryOptions = {
  queryKey: ["pods", "publish", "options"] as const,
  queryFn: async (): Promise<PublishPodOptions> => {
    const res = await apiFetch("/api/v1/pods/publish/options")
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        body.error ?? `Failed to fetch publish options: ${res.status}`
      )
    }
    return res.json()
  },
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
    staleTime: Number.POSITIVE_INFINITY,
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
        throw new Error(body.error ?? `Failed to fetch pod: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!podSlug,
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
    throw new Error(body.error ?? `Failed to delete published pod: ${res.status}`)
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
