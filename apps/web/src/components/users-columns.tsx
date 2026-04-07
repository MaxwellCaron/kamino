import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { IconKey, IconTrash, IconUsersGroup } from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/lib/queries"

type UserColumnsOptions = {
  onEditGroups: (user: ApiPrincipal) => void
  onSetPassword: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  onEditGroups,
  onSetPassword,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
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
      cell: ({ row }) => row.original.name ?? "—",
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
              onClick={() => onSetPassword(user)}
              title="Set Password"
            >
              <IconKey className="size-4" />
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
