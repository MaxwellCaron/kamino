import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { SnapshotTableRowActions } from "./snapshot-table-row-actions"
import type { SnapshotTableRowActionsProps } from "./snapshot-table-row-actions"
import type { ApiSnapshot } from "@/features/vms/types/vm-types"
import type { ColumnDef } from "@tanstack/react-table"

type SnapshotTableColumnsOptions = Omit<
  SnapshotTableRowActionsProps,
  "snapshot"
>

export function getSnapshotTableColumns(
  options: SnapshotTableColumnsOptions
): Array<ColumnDef<ApiSnapshot>> {
  return [
    {
      accessorKey: "name",
      header: () => <span className="pl-4">Snapshot</span>,
      cell: ({ row: { original: snapshot } }) => (
        <div className="flex items-center gap-3 pl-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Camera01Icon} className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate font-medium">{snapshot.name}</div>
            <p className="truncate text-xs text-muted-foreground">
              {snapshot.description || "No description"}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "snaptime",
      header: "Created",
      cell: ({ row: { original: snapshot } }) =>
        snapshot.snaptime ? (
          <RelativeTimeCard
            date={snapshot.snaptime * 1000}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "vmstate",
      header: "RAM",
      meta: { className: "text-center" },
      cell: ({ row: { original: snapshot } }) =>
        snapshot.vmstate ? (
          <Badge variant="secondary">Yes</Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      meta: { className: "pr-6 text-right" },
      cell: ({ row: { original: snapshot } }) => (
        <div className="flex justify-end gap-1">
          <SnapshotTableRowActions snapshot={snapshot} {...options} />
        </div>
      ),
    },
  ]
}
