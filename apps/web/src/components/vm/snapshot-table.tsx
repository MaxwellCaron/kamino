import {
  IconCamera,
  IconHistory,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
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
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"
import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import { loadingTransition } from "@/components/loading-transition"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"
import { snapshotsQueryOptions } from "@/lib/queries"
import { useDeleteSnapshot, useRollbackSnapshot } from "@/hooks/use-vm-actions"

export function SnapshotsTable({
  node,
  vmid,
  isTemplate,
  canManageSnapshots,
  isLoading: isVmLoading,
}: {
  node: string | null
  vmid: number | null
  isTemplate: boolean
  canManageSnapshots: boolean
  isLoading?: boolean
}) {
  const { data: snapshots, isLoading: isSnapshotsLoading } = useQuery({
    ...snapshotsQueryOptions(node ?? "", vmid ?? 0),
    enabled: !!node && vmid != null && canManageSnapshots,
  })
  const isLoading = isVmLoading || isSnapshotsLoading
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const rollback = useRollbackSnapshot(node ?? "", vmid ?? 0)
  const remove = useDeleteSnapshot(node ?? "", vmid ?? 0)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const filtered = snapshots?.filter((s) => s.name !== "current") ?? []

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
              !node ||
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
        <Table className="table-fixed">
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
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
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
                    {canManageSnapshots
                      ? "No snapshots found."
                      : "You do not have access to snapshots for this VM."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((snap) => (
                  <TableRow key={snap.name}>
                    <TableCell className="pl-6 font-medium text-wrap">
                      {snap.name}
                    </TableCell>
                    <TableCell className="text-wrap text-muted-foreground">
                      {snap.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {snap.snaptime
                        ? new Date(snap.snaptime * 1000).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {snap.vmstate ? (
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
                              description: `Are you sure you want to rollback to snapshot "${snap.name}"? The current VM state will be lost.`,
                              actionLabel: "Rollback",
                              onConfirm: () => {
                                toast.promise(
                                  rollback.mutateAsync({
                                    node: node!,
                                    vmid: vmid!,
                                    snapname: snap.name,
                                  }),
                                  {
                                    loading: `Rolling back to "${snap.name}"…`,
                                    success: `Rolled back to "${snap.name}"`,
                                    error: (err: Error) => err.message,
                                  }
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
                              description: `Are you sure you want to delete snapshot "${snap.name}"? This action cannot be undone.`,
                              actionLabel: "Delete",
                              variant: "destructive",
                              onConfirm: () => {
                                toast.promise(
                                  remove.mutateAsync({
                                    node: node!,
                                    vmid: vmid!,
                                    snapname: snap.name,
                                  }),
                                  {
                                    loading: `Deleting snapshot "${snap.name}"…`,
                                    success: `Snapshot "${snap.name}" deleted`,
                                    error: (err: Error) => err.message,
                                  }
                                )
                              },
                            })
                          }
                        >
                          <IconTrash className="size-4" />
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
      {node && vmid != null && (
        <SnapshotDialog
          node={node}
          vmid={vmid}
          open={snapshotOpen}
          onOpenChange={setSnapshotOpen}
        />
      )}
    </Card>
  )
}
