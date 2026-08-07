import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudIcon,
  Delete01Icon,
  Globe02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  RouterIcon,
  Tag02Icon,
} from "@hugeicons/core-free-icons"
import type { ColumnDef } from "@tanstack/react-table"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

type CloneTargetColumnsOptions = {
  canManage: boolean
  onEdit: (target: PodCloneTarget) => void
  onDeleteClick: (target: PodCloneTarget) => void
}

export function getCloneTargetColumns({
  canManage,
  onEdit,
  onDeleteClick,
}: CloneTargetColumnsOptions): Array<ColumnDef<PodCloneTarget>> {
  const columns: Array<ColumnDef<PodCloneTarget>> = [
    {
      accessorKey: "label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={Tag02Icon} title="Label" />
      ),
      cell: ({ row }) => (
        <div className="mx-3 flex items-center gap-2">
          <span className="text-wrap">{row.original.label}</span>
          {row.original.is_default ? (
            <Badge variant="secondary">Default</Badge>
          ) : null}
          {row.original.is_personal ? (
            <Badge variant="secondary">Personal</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "key",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={Tag02Icon} title="Key" />
      ),
      cell: ({ row }) => <span className="mx-3">{row.original.key}</span>,
    },
    {
      accessorKey: "lan_vnet",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={Globe02Icon}
          title="LAN / DMZ"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3">
          {row.original.lan_vnet}
          {row.original.dmz_vnet ? ` / ${row.original.dmz_vnet}` : ""}
        </span>
      ),
    },
    {
      accessorKey: "network_min",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={Tag02Icon}
          title="Networks"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3 tabular-nums">
          {row.original.network_min}–{row.original.network_max}
        </span>
      ),
    },
    {
      accessorKey: "wan_bridge",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={RouterIcon}
          title="WAN Bridge"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3">{row.original.wan_bridge}</span>
      ),
    },
    {
      accessorKey: "wan_subnet",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={Globe02Icon}
          title="WAN Subnet"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3 tabular-nums">{row.original.wan_subnet}</span>
      ),
    },
    {
      accessorKey: "cloud_init_storage",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={CloudIcon}
          title="Cloud-Init"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3">{row.original.cloud_init_storage}</span>
      ),
    },
  ]

  if (!canManage) {
    return columns
  }

  return [
    ...columns,
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: target } }) => (
        <div className="flex justify-end pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Open actions for clone target ${target.label}`}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(target)}>
                <HugeiconsIcon icon={PencilEdit01Icon} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={target.is_default || target.is_personal}
                onClick={() => onDeleteClick(target)}
              >
                <HugeiconsIcon icon={Delete01Icon} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
}
