import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import type { ColumnDef, Row } from "@tanstack/react-table"
import type { SyncChange } from "@/features/proxmox-sync/api/proxmox-sync-api"

function KindBadge({ kind }: { kind: SyncChange["kind"] }) {
  if (kind === "add") {
    return (
      <Badge className="bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400">
        Add
      </Badge>
    )
  }
  if (kind === "remove") {
    return <Badge className="bg-destructive/10 text-destructive">Remove</Badge>
  }
  return (
    <Badge className="bg-yellow-600/10 text-yellow-600 dark:bg-yellow-400/10 dark:text-yellow-400">
      Update
    </Badge>
  )
}

function DetailsCell({ row }: { row: Row<SyncChange> }) {
  const change = row.original

  if (change.kind === "update" && change.fields && change.fields.length > 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {change.fields.map((f) => (
          <span key={f.field} className="text-xs text-muted-foreground">
            <span className="font-medium">{f.field}</span>:{" "}
            <span className="line-through opacity-60">{f.from}</span>{" "}
            <span>→ {f.to}</span>
          </span>
        ))}
      </div>
    )
  }

  if (
    change.kind === "remove" &&
    change.blockers &&
    change.blockers.length > 0
  ) {
    return (
      <div className="flex flex-col gap-0.5">
        {change.blockers.map((b, i) => (
          <span key={i} className="text-xs text-destructive">
            {b}
          </span>
        ))}
      </div>
    )
  }

  return null
}

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
        <span className="font-medium">{row.original.name}</span>
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
