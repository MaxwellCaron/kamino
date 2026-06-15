import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"

export type PendingCloneBulkAction = {
  pod: PublishedPodCatalogEntry
  action: PodCloneAction
} | null

export type CloneBulkAction = Exclude<PendingCloneBulkAction, null>

export type PendingPrincipalCloneRowState =
  | "queued"
  | "running"
  | "success"
  | "error"

export type PendingPrincipalCloneRow = {
  progressId: string
  principal: PrincipalOption
  state: PendingPrincipalCloneRowState
  message?: string
}

export type PublishedPodsStats = {
  total: number
  listed: number
  unlisted: number
  restricted: number
  totalClones: number
}
