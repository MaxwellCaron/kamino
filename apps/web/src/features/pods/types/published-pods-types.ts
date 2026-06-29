import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"

export type PendingCloneBulkAction = {
  pod: PublishedPodCatalogEntry
  action: PodCloneAction
} | null

export type PublishedPodClonePendingAction =
  | { type: "start" | "shutdown"; clone: PublishedPodCloneSummary }
  | { type: "reclone"; clone: PublishedPodCloneSummary }
  | { type: "delete"; clone: PublishedPodCloneSummary }
  | null

export type CloneBulkAction = Exclude<PendingCloneBulkAction, null>

export type PendingCloneRowState = "queued" | "running" | "success" | "error"

export type PendingCloneRow = {
  progressId: string
  principal: PrincipalOption
  state: PendingCloneRowState
  message?: string
}

export type PublishedPodsStats = {
  total: number
  listed: number
  unlisted: number
  restricted: number
  totalClones: number
}
