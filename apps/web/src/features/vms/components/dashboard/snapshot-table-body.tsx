import { IconCamera } from "@tabler/icons-react"
import { AnimatePresence, m } from "motion/react"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { TableCell, TableRow } from "@workspace/ui/components/table"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { SnapshotTableRowActions } from "./snapshot-table-row-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiSnapshot } from "@/features/vms/types/vm-types"
import type { SnapshotTablePermissions } from "./snapshot-table"
import type { UseMutationResult } from "@tanstack/react-query"
import { loadingTransition } from "@/components/loading-transition"

type SnapshotTableBodyProps = {
  isLoading: boolean
  hasBeenLoading: boolean
  filtered: Array<ApiSnapshot>
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

export function SnapshotTableBody({
  isLoading,
  hasBeenLoading,
  filtered,
  itemId,
  permissions,
  onOpenConfirm,
  onOpenRequestRollback,
  rollback,
  remove,
  submitRollbackRequest,
  toastRollbackSnapshot,
  toastDeleteSnapshot,
}: SnapshotTableBodyProps) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.tbody
        key={isLoading ? "loading" : "loaded"}
        data-slot="table-body"
        initial={hasBeenLoading ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
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
            <TableRow key={snapshot.name} className="group cursor-pointer">
              <TableCell className="pl-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
                    <IconCamera className="size-5" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="truncate font-medium">{snapshot.name}</div>
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
                  <SnapshotTableRowActions
                    snapshot={snapshot}
                    itemId={itemId}
                    permissions={permissions}
                    onOpenConfirm={onOpenConfirm}
                    onOpenRequestRollback={onOpenRequestRollback}
                    rollback={rollback}
                    remove={remove}
                    submitRollbackRequest={submitRollbackRequest}
                    toastRollbackSnapshot={toastRollbackSnapshot}
                    toastDeleteSnapshot={toastDeleteSnapshot}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </m.tbody>
    </AnimatePresence>
  )
}
