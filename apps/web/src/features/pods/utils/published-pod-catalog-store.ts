import { useSyncExternalStore } from "react"
import type { PublishPodFormValues } from "@/features/pods/components/publish/publish-pod-form"
import type {
  PodStatus,
  PublishedPodCatalogEntry,
} from "@/features/pods/types/pod-types"
import { publishedPodCatalogSeed } from "@/features/pods/types/test-data"

let publishedPodCatalog = structuredClone(publishedPodCatalogSeed)
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((listener) => listener())
}

function createSlug(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "untitled-pod"
}

function getUniqueSlug(baseSlug: string, podId: string) {
  let slug = baseSlug
  let suffix = 2

  while (
    publishedPodCatalog.some((pod) => pod.slug === slug && pod.id !== podId)
  ) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return slug
}

export function subscribePublishedPodCatalog(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function getPublishedPodCatalogSnapshot() {
  return publishedPodCatalog
}

export function usePublishedPodCatalog() {
  return useSyncExternalStore(
    subscribePublishedPodCatalog,
    getPublishedPodCatalogSnapshot,
    getPublishedPodCatalogSnapshot
  )
}

export function getPublishedPodCatalogEntry(id: string) {
  return publishedPodCatalog.find((pod) => pod.id === id) ?? null
}

export function setPublishedPodStatus(
  id: string,
  status: PodStatus
): PublishedPodCatalogEntry | null {
  const existingEntry = getPublishedPodCatalogEntry(id)

  if (!existingEntry) {
    return null
  }

  const updatedEntry: PublishedPodCatalogEntry = {
    ...existingEntry,
    status,
  }

  publishedPodCatalog = publishedPodCatalog.map((pod) => {
    return pod.id === id ? updatedEntry : pod
  })

  emitChange()
  return updatedEntry
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
    vms_visible: pod.vms_visible,
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

export function savePublishedPod(values: PublishPodFormValues) {
  const existing = getPublishedPodCatalogEntry(values.id)
  const podId = existing?.id ?? values.id
  const baseSlug = createSlug(values.title)
  const slug = getUniqueSlug(baseSlug, podId)

  const nextEntry: PublishedPodCatalogEntry = {
    id: podId,
    title: values.title,
    slug,
    description: values.description,
    image: values.image,
    creators: structuredClone(values.creators),
    created_at: existing?.created_at ?? values.created_at,
    clone_count: existing?.clone_count ?? values.clone_count,
    status: values.status,
    audience: structuredClone(values.audience),
    vms_visible: values.vms_visible,
    tasks: structuredClone(values.tasks),
    source_folder: values.source_folder,
    virtual_machines: structuredClone(values.virtual_machines),
  }

  if (existing) {
    publishedPodCatalog = publishedPodCatalog.map((pod) =>
      pod.id === podId ? nextEntry : pod
    )
  } else {
    publishedPodCatalog = [nextEntry, ...publishedPodCatalog]
  }

  emitChange()

  return nextEntry
}
