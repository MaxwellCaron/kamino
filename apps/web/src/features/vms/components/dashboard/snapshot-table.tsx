import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Camera01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { SnapshotRequestRollbackDialog } from "./snapshot-request-rollback-dialog"
import { getSnapshotTableColumns } from "./snapshot-table-columns"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiSnapshot } from "@/features/vms/types/vm-types"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { SnapshotDialog } from "@/features/vms/components/snapshot-dialog"
import { snapshotsQueryOptions } from "@/features/vms/api/vm-api"
import {
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSubmitInventorySnapshotRollbackRequest,
} from "@/features/vms/hooks/use-vm-actions"
import {
  toastDeleteSnapshot,
  toastRollbackSnapshot,
  toastSubmitRollbackRequest,
} from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/format"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"

export type SnapshotTablePermissions = {
  canView: boolean
  canManage: boolean
  canRequest: boolean
}

export function SnapshotsTable({
  itemId,
  vmid,
  vmName,
  isTemplate,
  permissions,
}: {
  itemId: string
  vmid: number | null
  vmName?: string
  isTemplate: boolean
  permissions: SnapshotTablePermissions
}) {
  const {
    data: snapshots,
    isLoading: isSnapshotsLoading,
    error: snapshotsError,
  } = useQuery({
    ...snapshotsQueryOptions(itemId),
    enabled: !!itemId && vmid != null && permissions.canView,
  }) as {
    data: Array<ApiSnapshot> | undefined
    isLoading: boolean
    error: Error | null
  }
  const isLoading = isSnapshotsLoading
  const rollback = useRollbackSnapshot(itemId)
  const submitRollbackRequest = useSubmitInventorySnapshotRollbackRequest()
  const remove = useDeleteSnapshot(itemId)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [requestRollbackSnapshot, setRequestRollbackSnapshot] = useState<
    string | null
  >(null)
  const [requestRollbackOpen, setRequestRollbackOpen] = useState(false)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const vmReference = formatVmReference(vmid, vmName)
  const filtered =
    snapshots?.filter((snapshot) => snapshot.name !== "current") ?? []

  const openRequestRollbackDialog = (snapshotName: string) => {
    setRequestRollbackSnapshot(snapshotName)
    setRequestRollbackOpen(true)
  }

  const closeRequestRollbackDialog = () => {
    setRequestRollbackOpen(false)
    setRequestRollbackSnapshot(null)
  }
  const columns = getSnapshotTableColumns({
    itemId,
    permissions,
    onOpenConfirm: setConfirm,
    onOpenRequestRollback: openRequestRollbackDialog,
    rollback,
    remove,
    submitRollbackRequest,
    toastRollbackSnapshot,
    toastDeleteSnapshot,
  })

  if (!permissions.canView) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Camera01Icon}
            className="size-5 text-muted-foreground"
          />
          Snapshots
        </CardTitle>
        <CardDescription>
          {permissions.canManage
            ? "Point in time snapshots of the VM."
            : permissions.canRequest
              ? "Browse snapshots and submit rollback requests."
              : "Browse point in time snapshots of the VM."}
        </CardDescription>
        {(permissions.canManage || permissions.canRequest) && (
          <CardAction>
            <Button
              disabled={isLoading || isTemplate || !itemId || vmid == null}
              onClick={() => setSnapshotOpen(true)}
            >
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              <span className="hidden lg:block">Create</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1 border-b px-0">
        <SimpleDataTable
          animationKey={itemId}
          columns={columns}
          data={filtered}
          error={snapshotsError}
          getRowId={(snapshot) => snapshot.name}
          isLoading={isLoading}
        />
      </CardContent>
      <CardFooter className="justify-end text-muted-foreground">
        {filtered.length} result{filtered.length !== 1 && "s"}
      </CardFooter>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      <SnapshotRequestRollbackDialog
        open={requestRollbackOpen}
        snapshotName={requestRollbackSnapshot}
        vmReference={vmReference}
        itemId={itemId}
        submitRollbackRequest={submitRollbackRequest}
        onClose={closeRequestRollbackDialog}
        toastSubmitRollbackRequest={toastSubmitRollbackRequest}
      />
      {(permissions.canManage || permissions.canRequest) &&
        itemId &&
        vmid != null && (
          <SnapshotDialog
            itemId={itemId}
            vmid={vmid}
            vmName={vmName}
            mode={permissions.canManage ? "direct" : "request"}
            open={snapshotOpen}
            onOpenChange={setSnapshotOpen}
          />
        )}
    </Card>
  )
}
