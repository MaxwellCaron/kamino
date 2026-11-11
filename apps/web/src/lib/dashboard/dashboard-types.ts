import type {
  ClonedPod,
  PodQuestionSummary,
  PublishedPodCatalogEntry,
} from "@/lib/pods/pod-types"

export type ClonedPodEntry = {
  clonedPod: ClonedPod
  pod: PublishedPodCatalogEntry
  questionSummary: PodQuestionSummary
}
