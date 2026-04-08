import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { IconTrash, IconUsersGroup } from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/lib/queries"

type GroupColumnsOptions = {
  onEditGroups: (group: ApiPrincipal) => void
  onDeleteClick: (group: ApiPrincipal) => void
}

export function getGroupColumns({
  onEditGroups,
  onDeleteClick,
}: GroupColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
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
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "external_id",
      header: "ID",
    },
    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row: { original: user } }) => {
        return (
          <div className="flex justify-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEditGroups(user)}
              title="Edit Groups"
            >
              <IconUsersGroup className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDeleteClick(user)}
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
