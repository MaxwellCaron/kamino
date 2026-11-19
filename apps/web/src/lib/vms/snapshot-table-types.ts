import type { ApiSnapshot } from "@/lib/vms/vm-types"
import type { ConfirmConfig } from "@/lib/confirm-dialog"
import type { UseMutationResult } from "@tanstack/react-query"

export type SnapshotTablePermissions = {
  canView: boolean
  canManage: boolean
  canRequest: boolean
}

export type SnapshotTableRowActionsProps = {
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
}
