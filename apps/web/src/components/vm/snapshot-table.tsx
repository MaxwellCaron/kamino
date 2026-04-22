import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  IconCamera,
  IconHistory,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
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
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import { loadingTransition } from "@/components/loading-transition"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"
import { useDeleteSnapshot, useRollbackSnapshot } from "@/hooks/use-vm-actions"
import { snapshotsQueryOptions } from "@/lib/queries"

export function SnapshotsTable({
  itemId,
  vmid,
  vmName,
  isTemplate,
  canManageSnapshots,
  canRequestSnapshots,
  isLoading: isVmLoading,
}: {
  itemId: string
  vmid: number | null
  vmName?: string
  isTemplate: boolean
  canManageSnapshots: boolean
  canRequestSnapshots: boolean
  isLoading?: boolean
}) {
  const requestOnly = canRequestSnapshots && !canManageSnapshots
  const { data: snapshots, isLoading: isSnapshotsLoading } = useQuery({
    ...snapshotsQueryOptions(itemId),
    enabled: !!itemId && vmid != null && canManageSnapshots,
  })
  const isLoading = isVmLoading || isSnapshotsLoading
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const rollback = useRollbackSnapshot(itemId)
  const remove = useDeleteSnapshot(itemId)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const filtered = snapshots?.filter((snapshot) => snapshot.name !== "current") ?? []

  if (requestOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCamera className="size-5 text-muted-foreground" />
            Snapshots
          </CardTitle>
          <CardDescription>
            Snapshot requests stay available even when direct snapshot execution
            is not.
          </CardDescription>
          <CardAction>
            <Button
              disabled={isLoading || isTemplate || !itemId || vmid == null}
              onClick={() => setSnapshotOpen(true)}
            >
              <IconPlus />
              <span className="hidden lg:block">Open Request Flow</span>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="border-t">
          <Empty className="border border-dashed bg-muted/30">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconHistory />
              </EmptyMedia>
              <EmptyTitle>Request-only snapshot access</EmptyTitle>
              <EmptyDescription>
                Snapshot browsing still requires direct snapshot permission. Use
                the request flow to create a snapshot or submit a rollback by
                exact snapshot name.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
        <CardFooter className="justify-between text-muted-foreground">
          <span>Reviewers see the immutable request payload.</span>
          <Badge variant="secondary">Request queue</Badge>
        </CardFooter>
        {itemId && vmid != null && (
          <SnapshotDialog
            itemId={itemId}
            vmid={vmid}
            vmName={vmName}
            mode="request"
            open={snapshotOpen}
            onOpenChange={setSnapshotOpen}
          />
        )}
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconCamera className="size-5 text-muted-foreground" />
          Snapshots
        </CardTitle>
        <CardDescription>Point in time snapshots of the VM.</CardDescription>
        <CardAction>
          <Button
            disabled={
              isLoading ||
              isTemplate ||
              !canManageSnapshots ||
              !itemId ||
              vmid == null
            }
            onClick={() => setSnapshotOpen(true)}
          >
            <IconPlus />
            <span className="hidden lg:block">Create</span>
          </Button>
        </CardAction>
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
      {itemId && vmid != null && (
        <SnapshotDialog
          itemId={itemId}
          vmid={vmid}
          vmName={vmName}
          mode="direct"
          open={snapshotOpen}
          onOpenChange={setSnapshotOpen}
        />
      )}
    </Card>
  )
}
