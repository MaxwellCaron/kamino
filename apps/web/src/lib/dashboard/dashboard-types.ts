import type {
  ClonedPod,
  PublishedPodCatalogEntry,
} from "@/lib/pods/pod-types"

export type ClonedPodEntry = {
  clonedPod: ClonedPod
  pod: PublishedPodCatalogEntry
}
