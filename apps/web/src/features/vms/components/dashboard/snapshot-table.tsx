import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { IconCamera, IconPlus } from "@tabler/icons-react"
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
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { SnapshotTableBody } from "./snapshot-table-body"
import { SnapshotRequestRollbackDialog } from "./snapshot-request-rollback-dialog"
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
  const { data: snapshots, isLoading: isSnapshotsLoading } = useQuery({
    ...snapshotsQueryOptions(itemId),
    enabled: !!itemId && vmid != null && permissions.canView,
  }) as { data: Array<ApiSnapshot> | undefined; isLoading: boolean }
  const isLoading = isSnapshotsLoading
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
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

  if (!permissions.canView) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconCamera className="size-5 text-muted-foreground" />
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
              <IconPlus data-icon="inline-start" />
              <span className="hidden lg:block">Create</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1 border-b px-0">
        <Table className="min-w-180 table-fixed">
          <TableHeader className="bg-muted hover:bg-muted">
            <TableRow>
              <TableHead className="w-[40%] pl-4">Snapshot</TableHead>
              <TableHead className="w-[25%]">Created</TableHead>
              <TableHead className="w-[10%] text-center">RAM</TableHead>
              <TableHead className="w-[25%] pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <SnapshotTableBody
            isLoading={isLoading}
            hasBeenLoading={hasBeenLoading.current}
            filtered={filtered}
            itemId={itemId}
            permissions={permissions}
            onOpenConfirm={setConfirm}
            onOpenRequestRollback={openRequestRollbackDialog}
            rollback={rollback}
            remove={remove}
            submitRollbackRequest={submitRollbackRequest}
            toastRollbackSnapshot={toastRollbackSnapshot}
            toastDeleteSnapshot={toastDeleteSnapshot}
          />
        </Table>
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
