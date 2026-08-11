import { Badge } from "@workspace/ui/components/badge"
import { DetailsCell, KindBadge } from "./sync-diff-cells"
import type { ColumnDef } from "@tanstack/react-table"
import type { SyncChange } from "@/features/proxmox-sync/api/proxmox-sync-api"
import { createRowSelectionColumn } from "@/components/data-table/data-table-row-selection-column"

export function getSyncDiffColumns(): Array<ColumnDef<SyncChange>> {
  return [
    createRowSelectionColumn<SyncChange>((change) => change.name, {
      isRowDisabled: (change) =>
        change.kind === "remove" && change.removable === false,
    }),
    {
      id: "kind",
      header: "Change",
      meta: { className: "w-24" },
      cell: ({ row }) => <KindBadge kind={row.original.kind} />,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {row.original.name}
          {row.original.guest_type === "lxc" ? (
            <Badge variant="secondary">CT</Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "locator",
      header: "Node / VMID",
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">
          {row.original.node}/{row.original.vmid}
        </span>
      ),
    },
    {
      id: "template",
      header: "Template",
      cell: ({ row }) =>
        row.original.is_template ? (
          <Badge variant="secondary">Template</Badge>
        ) : null,
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => <DetailsCell row={row} />,
    },
  ]
}
