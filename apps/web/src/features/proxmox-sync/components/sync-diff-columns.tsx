import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import { DetailsCell, KindBadge } from "./sync-diff-cells"
import type { ColumnDef } from "@tanstack/react-table"
import type { SyncChange } from "@/features/proxmox-sync/api/proxmox-sync-api"

export function getSyncDiffColumns(): Array<ColumnDef<SyncChange>> {
  return [
    {
      id: "select",
      meta: { className: "w-0" },
      header: ({ table }) => (
        <div className="pl-4">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => {
        const isBlocked =
          row.original.kind === "remove" && row.original.removable === false
        return (
          <div className="pl-4">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              disabled={isBlocked}
              aria-label="Select row"
            />
          </div>
        )
      },
      enableSorting: false,
    },
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
