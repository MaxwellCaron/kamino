import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  IconCamera,
  IconHistory,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
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
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import { loadingTransition } from "@/components/loading-transition"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"
import {
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSubmitInventorySnapshotRollbackRequest,
} from "@/hooks/use-vm-actions"
import { snapshotsQueryOptions } from "@/lib/queries"

export function SnapshotsTable({
  itemId,
  vmid,
  vmName,
  isTemplate,
  canViewSnapshots,
  canManageSnapshots,
  canRequestSnapshots,
  isLoading: isVmLoading,
}: {
  itemId: string
  vmid: number | null
  vmName?: string
  isTemplate: boolean
  canViewSnapshots: boolean
  canManageSnapshots: boolean
  canRequestSnapshots: boolean
  isLoading?: boolean
}) {
  const { data: snapshots, isLoading: isSnapshotsLoading } = useQuery({
    ...snapshotsQueryOptions(itemId),
    enabled: !!itemId && vmid != null && canViewSnapshots,
  })
  const isLoading = isVmLoading || isSnapshotsLoading
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const rollback = useRollbackSnapshot(itemId)
  const submitRollbackRequest = useSubmitInventorySnapshotRollbackRequest()
  const remove = useDeleteSnapshot(itemId)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [requestRollbackSnapshot, setRequestRollbackSnapshot] = useState<
    string | null
  >(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const filtered =
    snapshots?.filter((snapshot) => snapshot.name !== "current") ?? []

  if (!canViewSnapshots) {
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
          {canManageSnapshots
            ? "Point in time snapshots of the VM."
            : canRequestSnapshots
              ? "Browse snapshots and submit rollback requests."
              : "Browse point in time snapshots of the VM."}
        </CardDescription>
        {(canManageSnapshots || canRequestSnapshots) && (
          <CardAction>
            <Button
              disabled={isLoading || isTemplate || !itemId || vmid == null}
              onClick={() => setSnapshotOpen(true)}
            >
              <IconPlus />
              <span className="hidden lg:block">
                {canManageSnapshots ? "Create" : "Create Request"}
              </span>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="border-b px-0">
        <Table className="min-w-180 table-fixed">
          <TableHeader className="bg-muted hover:bg-muted">
            <TableRow>
              <TableHead className="w-[20%] pl-6">Name</TableHead>
              <TableHead className="w-[30%]">Description</TableHead>
              <TableHead className="w-[25%]">Date</TableHead>
              <TableHead className="w-[10%]">RAM</TableHead>
              <TableHead className="w-[15%] pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <AnimatePresence mode="wait">
            <motion.tbody
              key={isLoading ? "loading" : "loaded"}
              data-slot="table-body"
              initial={
                hasBeenLoading.current ? { opacity: 0, height: 0 } : false
              }
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={loadingTransition}
              className="overflow-hidden [&_tr:last-child]:border-0"
            >
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell className="pl-6">
                      <Skeleton className="h-4 w-3/4 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-4/5 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/4 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-1/2 rounded-md" />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <Skeleton className="size-6 rounded-md" />
                        <Skeleton className="size-6 rounded-md" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No snapshots found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((snapshot) => (
                  <TableRow key={snapshot.name}>
                    <TableCell className="pl-6 font-medium text-wrap">
                      {snapshot.name}
                    </TableCell>
                    <TableCell className="text-wrap text-muted-foreground">
                      {snapshot.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {snapshot.snaptime
                        ? new Date(snapshot.snaptime * 1000).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {snapshot.vmstate ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        "No"
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        {canManageSnapshots ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Rollback"
                              disabled={!canManageSnapshots}
                              onClick={() =>
                                setConfirm({
                                  title: "Rollback Snapshot",
                                  icon: IconHistory,
                                  description: `Are you sure you want to rollback to snapshot "${snapshot.name}"? The current VM state will be lost.`,
                                  actionLabel: "Rollback",
                                  onConfirm: () => {
                                    const promise = rollback.mutateAsync({
                                      itemId,
                                      snapname: snapshot.name,
                                    })

                                    toast.promise(promise, {
                                      loading: `Rolling back to "${snapshot.name}"…`,
                                      success: `Rolled back to "${snapshot.name}"`,
                                      error: (err: Error) => err.message,
                                    })
                                  },
                                })
                              }
                            >
                              <IconHistory className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Delete"
                              disabled={!canManageSnapshots}
                              onClick={() =>
                                setConfirm({
                                  title: "Delete Snapshot",
                                  icon: IconTrash,
                                  description: `Are you sure you want to delete snapshot "${snapshot.name}"?`,
                                  actionLabel: "Delete",
                                  variant: "destructive",
                                  onConfirm: () => {
                                    const promise = remove.mutateAsync({
                                      itemId,
                                      snapname: snapshot.name,
                                    })

                                    toast.promise(promise, {
                                      loading: `Deleting snapshot "${snapshot.name}"…`,
                                      success: `Snapshot "${snapshot.name}" deleted`,
                                      error: (err: Error) => err.message,
                                    })
                                  },
                                })
                              }
                            >
                              <IconTrash className="size-4 text-destructive" />
                            </Button>
                          </>
                        ) : canRequestSnapshots ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Request rollback"
                            disabled={submitRollbackRequest.isPending}
                            onClick={() =>
                              setRequestRollbackSnapshot(snapshot.name)
                            }
                          >
                            <IconHistory className="size-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </motion.tbody>
          </AnimatePresence>
        </Table>
      </CardContent>
      <CardFooter className="justify-end text-muted-foreground">
        {filtered.length} result{filtered.length !== 1 && "s"}
      </CardFooter>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      <AlertDialog
        open={requestRollbackSnapshot !== null}
        onOpenChange={(open) => {
          if (!open && !submitRollbackRequest.isPending) {
            setRequestRollbackSnapshot(null)
          }
        }}
      >
        <AppAlertDialogContent
          icon={IconHistory}
          title="Submit Rollback Request"
          description={
            requestRollbackSnapshot ? (
              <>
                Submit a rollback request for snapshot{" "}
                <span className="font-medium text-foreground">
                  {requestRollbackSnapshot}
                </span>
                ? A reviewer must approve it before the VM is reverted.
              </>
            ) : null
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitRollbackRequest.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                submitRollbackRequest.isPending ||
                requestRollbackSnapshot === null
              }
              onClick={async () => {
                if (requestRollbackSnapshot === null) return

                const promise = submitRollbackRequest.mutateAsync({
                  itemId,
                  snapname: requestRollbackSnapshot,
                })

                toast.promise(promise, {
                  loading: `Submitting rollback request for "${requestRollbackSnapshot}"…`,
                  success: `Rollback request for "${requestRollbackSnapshot}" submitted`,
                  error: (err: Error) => err.message,
                })

                try {
                  await promise
                  setRequestRollbackSnapshot(null)
                } catch {
                  // Error feedback is handled by the mutation toast.
                }
              }}
            >
              {submitRollbackRequest.isPending
                ? "Submitting..."
                : "Submit Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
      {(canManageSnapshots || canRequestSnapshots) &&
        itemId &&
        vmid != null && (
          <SnapshotDialog
            itemId={itemId}
            vmid={vmid}
            vmName={vmName}
            mode={canManageSnapshots ? "direct" : "request"}
            open={snapshotOpen}
            onOpenChange={setSnapshotOpen}
          />
        )}
    </Card>
  )
}
