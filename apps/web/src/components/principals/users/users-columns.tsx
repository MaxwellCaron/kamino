import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  IconDots,
  IconEdit,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/lib/queries"

type UserColumnsOptions = {
  canManage: boolean
  onEditClick: (user: ApiPrincipal) => void
  onEditGroups: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  canManage,
  onEditClick,
  onEditGroups,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  const columns: Array<ColumnDef<ApiPrincipal>> = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row: { original: user } }) => (
        <p className="text-wrap">{user.description}</p>
      ),
    },
  ]

  if (!canManage) {
    return columns
  }

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
    ...columns,
    {
      id: "actions",
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: user } }) => (
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
              <DropdownMenuItem onClick={() => onEditClick(user)}>
                <IconEdit className="text-muted-foreground" />
                Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditGroups(user)}>
                <IconUsersGroup className="text-muted-foreground" />
                Edit Groups
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(user)}
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
