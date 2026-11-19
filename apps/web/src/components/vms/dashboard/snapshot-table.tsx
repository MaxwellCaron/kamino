import { Add01Icon, Camera01Icon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSubmitInventorySnapshotRollbackRequest,
} from "@/hooks/vms/use-vm-actions"
import type { ApiSnapshot } from "@/lib/vms/vm-types"
import { Button } from "@workspace/ui/components/button"
import type { ConfirmConfig } from "@/lib/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"
import { SnapshotDialog } from "@/components/vms/snapshot-dialog"
import { SnapshotRequestRollbackDialog } from "@/components/vms/dashboard/snapshot-request-rollback-dialog"
import type { SnapshotTablePermissions } from "@/lib/vms/snapshot-table-types"
import { formatVmReference } from "@/lib/vms/vm-reference"
import { getSnapshotTableColumns } from "@/components/vms/dashboard/snapshot-table-columns"
import { snapshotsQueryOptions } from "@/lib/vms/vm-api"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

function SnapshotDialogs({
  confirm,
  guestType,
  itemId,
  onCloseConfirm,
  onCloseRollbackRequest,
  onSnapshotOpenChange,
  permissions,
  requestRollbackSnapshot,
  snapshotOpen,
  submitRollbackRequest,
  vmid,
  vmName,
  vmReference,
}: {
  confirm: ConfirmConfig | null
  guestType?: "qemu" | "lxc"
  itemId: string
  onCloseConfirm: () => void
  onCloseRollbackRequest: () => void
  onSnapshotOpenChange: (open: boolean) => void
  permissions: SnapshotTablePermissions
  requestRollbackSnapshot: string | null
  snapshotOpen: boolean
  submitRollbackRequest: ReturnType<
    typeof useSubmitInventorySnapshotRollbackRequest
  >
  vmid: number | null
  vmName?: string
  vmReference: string
}) {
  const canCreateSnapshot = permissions.canManage || permissions.canRequest

  return (
    <>
      <ConfirmDialog config={confirm} onClose={onCloseConfirm} />
      <SnapshotRequestRollbackDialog
        open={requestRollbackSnapshot !== null}
        snapshotName={requestRollbackSnapshot}
        vmReference={vmReference}
        itemId={itemId}
        submitRollbackRequest={submitRollbackRequest}
        onClose={onCloseRollbackRequest}
      />
      {canCreateSnapshot && itemId && vmid != null ? (
        <SnapshotDialog
          itemId={itemId}
          vmid={vmid}
          vmName={vmName}
          guestType={guestType}
          mode={permissions.canManage ? "direct" : "request"}
          open={snapshotOpen}
          onOpenChange={onSnapshotOpenChange}
        />
      ) : null}
    </>
  )
}

function getSnapshotsDescription(permissions: SnapshotTablePermissions) {
  if (permissions.canManage) return "Point in time snapshots of the VM."
  if (permissions.canRequest) {
    return "Browse snapshots and submit rollback requests."
  }
  return "Browse point in time snapshots of the VM."
}

export function SnapshotsTable({
  itemId,
  vmid,
  vmName,
  guestType,
  isTemplate,
  permissions,
}: {
  itemId: string
  vmid: number | null
  vmName?: string
  guestType?: "qemu" | "lxc"
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
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const vmReference = formatVmReference(vmid, vmName)
  const filtered =
    snapshots?.filter((snapshot) => snapshot.name !== "current") ?? []

  const closeRequestRollbackDialog = () => {
    setRequestRollbackSnapshot(null)
  }
  const columns = getSnapshotTableColumns({
    itemId,
    permissions,
    onOpenConfirm: setConfirm,
    onOpenRequestRollback: setRequestRollbackSnapshot,
    rollback,
    remove,
    submitRollbackRequest,
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
          {getSnapshotsDescription(permissions)}
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
      <SnapshotDialogs
        confirm={confirm}
        guestType={guestType}
        itemId={itemId}
        onCloseConfirm={() => setConfirm(null)}
        onCloseRollbackRequest={closeRequestRollbackDialog}
        onSnapshotOpenChange={setSnapshotOpen}
        permissions={permissions}
        requestRollbackSnapshot={requestRollbackSnapshot}
        snapshotOpen={snapshotOpen}
        submitRollbackRequest={submitRollbackRequest}
        vmid={vmid}
        vmName={vmName}
        vmReference={vmReference}
      />
    </Card>
  )
}
