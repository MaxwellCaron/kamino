import { DeletePublishedPodDialog } from "./delete-published-pod-dialog"
import { BulkCloneActionDialog } from "./bulk-clone-action-dialog"
import { ManagerCloneDialog } from "./manager-clone-dialog"
import type {
  PendingCloneBulkAction,
  PendingCloneRow,
} from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { CloneBulkAction } from "@/features/pods/types/published-pods-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

export function PublishedPodsPageDialogs({
  pendingDeletePod,
  isDeletePending,
  onDeleteConfirm,
  onDeleteOpenChange,
  pendingCloneBulkAction,
  isBulkClonePending,
  onBulkCloneConfirm,
  onBulkCloneOpenChange,
  pendingManagerClonePod,
  pendingCloneRowsByPodId,
  onManagerCloneOpenChange,
  onManagerCloneConfirm,
}: {
  pendingDeletePod: PublishedPodCatalogEntry | null
  isDeletePending: boolean
  onDeleteConfirm: (pod: PublishedPodCatalogEntry) => void
  onDeleteOpenChange: (open: boolean) => void
  pendingCloneBulkAction: PendingCloneBulkAction
  isBulkClonePending: boolean
  onBulkCloneConfirm: (action: CloneBulkAction) => void
  onBulkCloneOpenChange: (open: boolean) => void
  pendingManagerClonePod: PublishedPodCatalogEntry | null
  pendingCloneRowsByPodId: Record<string, Array<PendingCloneRow>>
  onManagerCloneOpenChange: (open: boolean) => void
  onManagerCloneConfirm: (
    pod: PublishedPodCatalogEntry,
    principals: Array<PrincipalOption>
  ) => void
}) {
  return (
    <>
      <DeletePublishedPodDialog
        isPending={isDeletePending}
        onConfirm={onDeleteConfirm}
        onOpenChange={onDeleteOpenChange}
        pod={pendingDeletePod}
      />
      <BulkCloneActionDialog
        isPending={isBulkClonePending}
        onConfirm={onBulkCloneConfirm}
        onOpenChange={onBulkCloneOpenChange}
        pendingAction={pendingCloneBulkAction}
      />
      <ManagerCloneDialog
        pod={pendingManagerClonePod}
        open={pendingManagerClonePod !== null}
        onOpenChange={onManagerCloneOpenChange}
        pendingRowsByPodId={pendingCloneRowsByPodId}
        onConfirm={onManagerCloneConfirm}
      />
    </>
  )
}
