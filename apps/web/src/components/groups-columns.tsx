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

type GroupColumnsOptions = {
  onEditClick: (group: ApiPrincipal) => void
  onEditGroups: (group: ApiPrincipal) => void
  onDeleteClick: (group: ApiPrincipal) => void
}

export function getGroupColumns({
  onEditClick,
  onEditGroups,
  onDeleteClick,
}: GroupColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
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
      cell: ({ row: { original: group } }) => (
        <Tooltip>
          <TooltipTrigger render={<span>{group.name}</span>} />
          <TooltipContent>
            <span>{group.external_id}</span>
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row: { original: group } }) => (
        <p className="text-wrap">{group.description}</p>
      ),
    },
    {
      id: "actions",
      header: () => (
        <div className="flex justify-end pr-6">
          <div className="w-18 text-center">Actions</div>
        </div>
      ),
      cell: ({ row: { original: group } }) => {
        return (
          <div className="flex justify-end pr-6">
            <div className="flex w-18 justify-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEditClick(group)}
                title="Edit Group"
              >
                <IconEdit className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEditGroups(group)}
                title="Edit Members"
              >
                <IconUsersGroup className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDeleteClick(group)}
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
