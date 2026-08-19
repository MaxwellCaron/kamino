import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import type { AppTableFeatures } from "@/components/data-table/data-table-types"
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { createRowSelectionColumn } from "@/components/data-table/data-table-row-selection-column"

type VNetColumnsOptions = {
  canManage: boolean
  onEditVnet: (vnet: ApiVNet) => void
  onDeleteClick: (vnet: ApiVNet) => void
}

export function getVNetColumns({
  canManage,
  onEditVnet,
  onDeleteClick,
}: VNetColumnsOptions): Array<ColumnDef<AppTableFeatures, ApiVNet>> {
  const columns: Array<ColumnDef<AppTableFeatures, ApiVNet>> = [
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
    createRowSelectionColumn<ApiVNet>((vnet) => vnet.vnet),
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
              <DropdownMenuGroup>
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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
}
