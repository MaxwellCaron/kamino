import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { IconTrash, IconUsersGroup } from "@tabler/icons-react"
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
      header: ({ table }) => (
        <div className="flex justify-center">
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
        <div className="flex justify-center">
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
    },
    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row: { original: vnet } }) => {
        return (
          <div className="flex justify-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEditVnet(vnet)}
              title="Edit"
            >
              <IconUsersGroup className="size-4" />
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
        )
      },
    },
  ]
}
