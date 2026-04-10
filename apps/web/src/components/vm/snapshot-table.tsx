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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"
import { useState } from "react"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import { snapshotsQueryOptions } from "@/lib/queries"
import { useDeleteSnapshot, useRollbackSnapshot } from "@/hooks/use-vm-actions"

export function SnapshotsTable({
  node,
  vmid,
  isTemplate,
}: {
  node: string
  vmid: number
  isTemplate: boolean
}) {
  const { data: snapshots, isLoading } = useQuery(
    snapshotsQueryOptions(node, vmid)
  )
  const rollback = useRollbackSnapshot(node, vmid)
  const remove = useDeleteSnapshot(node, vmid)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const filtered = snapshots?.filter((s) => s.name !== "current") ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconCamera className="size-6" />
          Snapshots
        </CardTitle>
        <CardDescription>Point in time snapshots of the VM.</CardDescription>
        <CardAction>
          <Button disabled={isLoading || isTemplate}>
            <IconPlus />
            <span className="hidden lg:block">Create</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="border-b px-0">
        <Table>
          <TableHeader className="bg-muted hover:bg-muted">
            <TableRow>
              <TableHead className="pl-6">Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-24">RAM</TableHead>
              <TableHead className="w-32 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  No snapshots found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((snap) => (
                <TableRow key={snap.name}>
                  <TableCell className="pl-6 font-medium">
                    {snap.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
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
                        onClick={() =>
                          setConfirm({
                            title: "Rollback Snapshot",
                            description: `Are you sure you want to rollback to snapshot "${snap.name}"? The current VM state will be lost.`,
                            actionLabel: "Rollback",
                            onConfirm: () => {
                              toast.promise(
                                rollback.mutateAsync({
                                  node,
                                  vmid,
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
                        onClick={() =>
                          setConfirm({
                            title: "Delete Snapshot",
                            description: `Are you sure you want to delete snapshot "${snap.name}"? This action cannot be undone.`,
                            actionLabel: "Delete",
                            variant: "destructive",
                            onConfirm: () => {
                              toast.promise(
                                remove.mutateAsync({
                                  node,
                                  vmid,
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
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-end text-muted-foreground">
        {filtered.length} result{filtered.length !== 1 && "s"}
      </CardFooter>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </Card>
  )
}
