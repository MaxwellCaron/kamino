import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete01Icon,
  EthernetPortIcon,
  Globe02Icon,
  GroupIcon,
  MoreHorizontalIcon,
  NotebookIcon,
  PencilEdit01Icon,
  Tag02Icon,
  Wifi02Icon,
} from "@hugeicons/core-free-icons"
import { EnabledBadge } from "@workspace/ui/components/enabled-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

type VNetColumnsOptions = {
  canManage: boolean
  onEditVnet: (vnet: ApiVNet) => void
  onDeleteClick: (vnet: ApiVNet) => void
}

export function getVNetColumns({
  canManage,
  onEditVnet,
  onDeleteClick,
}: VNetColumnsOptions): Array<ColumnDef<ApiVNet>> {
  const columns: Array<ColumnDef<ApiVNet>> = [
    {
      accessorKey: "vnet",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={Globe02Icon}
          title="Name"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3 text-wrap">{row.original.vnet}</span>
      ),
    },
    {
      accessorKey: "alias",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={NotebookIcon}
          title="Alias"
        />
      ),
      cell: ({ row }) => (
        <span className="mx-3 text-wrap">{row.original.alias}</span>
      ),
    },
    {
      accessorKey: "zone",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={GroupIcon} title="Zone" />
      ),
      cell: ({ row }) => <span className="mx-3">{row.original.zone}</span>,
    },
    {
      accessorKey: "tag",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={Tag02Icon} title="Tag" />
      ),
      cell: ({ row }) => <span className="mx-3">{row.original.tag}</span>,
    },
    {
      accessorKey: "isolate_ports",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={EthernetPortIcon}
          title="Isolated Ports"
        />
      ),
      cell: ({ row }) => (
        <div className="mx-3">
          <EnabledBadge value={row.original.isolate_ports} />
        </div>
      ),
    },
    {
      accessorKey: "vlanaware",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={Wifi02Icon}
          title="VLAN Aware"
        />
      ),
      cell: ({ row }) => (
        <div className="mx-3">
          <EnabledBadge value={row.original.vlanaware} />
        </div>
      ),
    },
  ]

  if (!canManage) {
    return columns
  }

  return [
    {
      id: "select",
      enableSorting: false,
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
      cell: ({ row }) => (
        <div className="pl-4">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
    },
    ...columns,
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: vnet } }) => (
        <div className="flex justify-end pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Open actions for VNet ${vnet.vnet}`}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditVnet(vnet)}>
                <HugeiconsIcon icon={PencilEdit01Icon} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(vnet)}
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
