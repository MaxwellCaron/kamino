import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons"
import type { ColumnDef } from "@tanstack/react-table"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

export const managerClonePrincipalColumns: Array<ColumnDef<PrincipalOption>> = [
  {
    accessorKey: "label",
    header: ({ table }) => (
      <div className="flex items-center gap-3 pl-4">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
        <span>Name</span>
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-3 pl-4">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.label}`}
        />
        <span>{row.original.label}</span>
      </div>
    ),
  },
  {
    accessorKey: "type",
    meta: { className: "w-0 pr-4 text-center" },
    header: "Type",
    cell: ({ row: { original: principal } }) => (
      <Badge variant={principal.type === "user" ? "default" : "secondary"}>
        <HugeiconsIcon
          icon={principal.type === "user" ? UserIcon : UserGroupIcon}
        />
        {principal.type.charAt(0).toUpperCase() + principal.type.slice(1)}
      </Badge>
    ),
  },
]
