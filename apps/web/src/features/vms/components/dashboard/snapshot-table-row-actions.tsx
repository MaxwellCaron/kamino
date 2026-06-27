import { HugeiconsIcon } from "@hugeicons/react"
import { Delete01Icon, HistoryIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiSnapshot } from "@/features/vms/types/vm-types"
import type { SnapshotTablePermissions } from "./snapshot-table"
import type { UseMutationResult } from "@tanstack/react-query"

type SnapshotTableRowActionsProps = {
  snapshot: ApiSnapshot
  itemId: string
  permissions: SnapshotTablePermissions
  onOpenConfirm: (config: ConfirmConfig) => void
  onOpenRequestRollback: (snapshotName: string) => void
  rollback: UseMutationResult<
    unknown,
    Error,
    { itemId: string; snapname: string },
    unknown
  >
  remove: UseMutationResult<
    unknown,
    Error,
    { itemId: string; snapname: string },
    unknown
  >
  submitRollbackRequest: UseMutationResult<
    unknown,
    Error,
    { itemId: string; snapname: string },
    unknown
  >
  toastRollbackSnapshot: (
    promise: Promise<unknown>,
    snapshotName: string
  ) => void
  toastDeleteSnapshot: (promise: Promise<unknown>, snapshotName: string) => void
}

export function SnapshotTableRowActions({
  snapshot,
  itemId,
  permissions,
  onOpenConfirm,
  onOpenRequestRollback,
  rollback,
  remove,
  submitRollbackRequest,
  toastRollbackSnapshot,
  toastDeleteSnapshot,
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

                toastRollbackSnapshot(promise, snapshot.name)
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

                toastDeleteSnapshot(promise, snapshot.name)
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
