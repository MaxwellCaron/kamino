import { Delete01Icon, HistoryIcon } from "@hugeicons/core-free-icons"
import {
  getDeleteSnapshotToastOptions,
  getRollbackSnapshotToastOptions,
} from "@/lib/vms/vm-toasts"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import type { SnapshotTableRowActionsProps } from "@/lib/vms/snapshot-table-types"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"

export function SnapshotTableRowActions({
  snapshot,
  itemId,
  permissions,
  onOpenConfirm,
  onOpenRequestRollback,
  rollback,
  remove,
  submitRollbackRequest,
}: SnapshotTableRowActionsProps) {
  if (permissions.canManage) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Rollback"
          disabled={!permissions.canManage}
          onClick={() =>
            onOpenConfirm({
              title: "Rollback Snapshot",
              icon: HistoryIcon,
              description: `Are you sure you want to rollback to snapshot "${snapshot.name}"? The current VM state will be lost.`,
              actionLabel: "Rollback",
              onConfirm: () => {
                const promise = rollback.mutateAsync({
                  itemId,
                  snapname: snapshot.name,
                })

                showSingleMutationToast(
                  getRollbackSnapshotToastOptions(promise, snapshot.name)
                )
              },
            })
          }
        >
          <HugeiconsIcon icon={HistoryIcon} className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Delete"
          disabled={!permissions.canManage}
          onClick={() =>
            onOpenConfirm({
              title: "Delete Snapshot",
              icon: Delete01Icon,
              description: `Are you sure you want to delete snapshot "${snapshot.name}"?`,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                const promise = remove.mutateAsync({
                  itemId,
                  snapname: snapshot.name,
                })

                showSingleMutationToast(
                  getDeleteSnapshotToastOptions(promise, snapshot.name)
                )
              },
            })
          }
        >
          <HugeiconsIcon
            icon={Delete01Icon}
            className="size-4 text-destructive"
          />
        </Button>
      </>
    )
  }

  if (permissions.canRequest) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        title="Rollback"
        disabled={submitRollbackRequest.isPending}
        onClick={() => onOpenRequestRollback(snapshot.name)}
      >
        <HugeiconsIcon icon={HistoryIcon} className="size-4" />
      </Button>
    )
  }

  return <span className="text-muted-foreground">—</span>
}
