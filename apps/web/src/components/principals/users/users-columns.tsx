import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { IconEdit, IconTrash, IconUsersGroup } from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/lib/queries"

type UserColumnsOptions = {
  onEditClick: (user: ApiPrincipal) => void
  onEditGroups: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  onEditClick,
  onEditGroups,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
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
      accessorKey: "name",
      header: "Name",
      size: 300,
      cell: ({ row: { original: user } }) => (
        <Tooltip>
          <TooltipTrigger
            render={<span className="text-wrap">{user.name}</span>}
          />
          <TooltipContent>
            <span>{user.external_id}</span>
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row: { original: user } }) => (
        <p className="text-wrap">{user.description}</p>
      ),
    },
    {
      id: "actions",
      size: 120,
      header: () => (
        <div className="flex justify-end pr-6">
          <div className="w-18 text-center">Actions</div>
        </div>
      ),
      cell: ({ row: { original: user } }) => {
        return (
          <div className="flex justify-end pr-6">
            <div className="flex w-18 justify-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEditClick(user)}
                title="Edit User"
              >
                <IconEdit className="size-4" />
              </Button>

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
          </div>
        )
      },
    },
  ]
}
