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
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { loadingTransition } from "@/components/loading-transition"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"
import { snapshotsQueryOptions } from "@/lib/queries"
import {
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSubmitInventorySnapshotRollbackRequest,
} from "@/hooks/use-vm-actions"
import {
  toastDeleteSnapshot,
  toastRollbackSnapshot,
  toastSubmitRollbackRequest,
} from "@/components/vm/utils"
import { formatVmReference } from "@/lib/utils"

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
  }) as { data: Array<any> | undefined; isLoading: boolean }
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
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 shrink-0 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-32 rounded-md" />
                          <Skeleton className="h-3 w-48 rounded-md" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Skeleton className="h-5 w-10 rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <Skeleton className="size-8 rounded-md" />
                        <Skeleton className="size-8 rounded-md" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No snapshots found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((snapshot) => (
                  <TableRow
                    key={snapshot.name}
                    className="group cursor-default"
                  >
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
                          <IconCamera className="size-5" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="truncate font-medium">
                            {snapshot.name}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {snapshot.description || "No description"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {snapshot.snaptime ? (
                        <RelativeTimeCard
                          date={snapshot.snaptime * 1000}
                          timezones={["UTC"]}
                          delay={50}
                          closeDelay={150}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {snapshot.vmstate ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
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

                                    toastRollbackSnapshot(
                                      promise,
                                      snapshot.name
                                    )
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

                                    toastDeleteSnapshot(promise, snapshot.name)
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
                            title="Rollback"
                            disabled={submitRollbackRequest.isPending}
                            onClick={() =>
                              openRequestRollbackDialog(snapshot.name)
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
        open={requestRollbackOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (submitRollbackRequest.isPending) {
              return
            }

            closeRequestRollbackDialog()
          }
        }}
      >
        <AppAlertDialogContent
          open={requestRollbackOpen}
          icon={IconHistory}
          title="Rollback"
          description={
            requestRollbackSnapshot ? (
              <>
                Approval required. Rolling back {vmReference} to snapshot{" "}
                <span className="font-medium">{requestRollbackSnapshot}</span>{" "}
                will be added to the queue for review.
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

                toastSubmitRollbackRequest(promise, requestRollbackSnapshot)

                try {
                  await promise
                  closeRequestRollbackDialog()
                } catch {
                  // Error feedback is handled by the mutation toast.
                }
              }}
            >
              {submitRollbackRequest.isPending ? "Submitting..." : "Submit"}
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
