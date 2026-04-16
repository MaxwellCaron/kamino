import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiVNet } from "@/lib/queries"

type VNetColumnsOptions = {
  onEditVnet: (vnet: ApiVNet) => void
  onDeleteClick: (vnet: ApiVNet) => void
}

export function getVNetColumns({
  onEditVnet,
  onDeleteClick,
}: VNetColumnsOptions): Array<ColumnDef<ApiVNet>> {
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
    {
      accessorKey: "vnet",
      header: "Name",
      cell: ({ row }) => <span className="text-wrap">{row.original.vnet}</span>,
    },
    {
      accessorKey: "zone",
      header: "Zone",
    },
    {
      accessorKey: "tag",
      header: "VLAN Tag",
    },
    {
      accessorKey: "alias",
      header: "Alias",
      cell: ({ row }) => (
        <span className="text-wrap">{row.original.alias}</span>
      ),
    },
    {
      id: "actions",
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: vnet } }) => (
        <div className="flex justify-end pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs">
                  <IconDots className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditVnet(vnet)}>
                <IconEdit />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(vnet)}
              >
                <IconTrash />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
}
