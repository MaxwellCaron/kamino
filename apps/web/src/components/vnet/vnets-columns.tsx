import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { IconEdit, IconTrash } from "@tabler/icons-react"
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
      size: 48,
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
      size: 100,
      header: () => (
        <div className="flex justify-end pr-6">
          <div className="w-16 text-center">Actions</div>
        </div>
      ),
      cell: ({ row: { original: vnet } }) => {
        return (
          <div className="flex justify-end pr-6">
            <div className="flex w-16 justify-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEditVnet(vnet)}
                title="Edit"
              >
                <IconEdit className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDeleteClick(vnet)}
                title="Delete"
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          </div>
        )
      },
    },
  ]
}
