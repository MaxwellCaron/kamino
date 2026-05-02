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
  IconLockAccess,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"

type GroupColumnsOptions = {
  canManageGroups: boolean
  canManageAccess: boolean
  onEditClick: (group: ApiPrincipal) => void
  onEditGroups: (group: ApiPrincipal) => void
  onEditAccess: (group: ApiPrincipal) => void
  onDeleteClick: (group: ApiPrincipal) => void
}

export function getGroupColumns({
  canManageGroups,
  canManageAccess,
  onEditClick,
  onEditGroups,
  onEditAccess,
  onDeleteClick,
}: GroupColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  const columns: Array<ColumnDef<ApiPrincipal>> = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "description",
      header: () => <span className="pl-12">Description</span>,
      cell: ({ row: { original: group } }) => (
        <p className="pr-8 pl-12 text-wrap text-muted-foreground">
          {group.description || "—"}
        </p>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row: { original: group } }) =>
        group.created_at ? (
          <RelativeTimeCard
            date={group.created_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
            variant="muted"
          />
        ) : (
          "—"
        ),
    },
  ]

  if (!canManageGroups && !canManageAccess) {
    return columns
  }

  const managedColumns = [...columns]

  if (canManageGroups) {
    managedColumns.unshift({
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
    })
  }

  managedColumns.push({
    id: "actions",
    meta: { className: "w-0" },
    header: () => null,
    cell: ({ row: { original: group } }) => (
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
            {canManageGroups && (
              <DropdownMenuItem onClick={() => onEditClick(group)}>
                <IconEdit className="text-muted-foreground" />
                Edit
              </DropdownMenuItem>
            )}
            {canManageAccess && (
              <DropdownMenuItem onClick={() => onEditAccess(group)}>
                <IconLockAccess className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
            {canManageGroups && (
              <DropdownMenuItem onClick={() => onEditGroups(group)}>
                <IconUsersGroup className="text-muted-foreground" />
                Members
              </DropdownMenuItem>
            )}
            {canManageGroups && canManageAccess && <DropdownMenuSeparator />}
            {canManageGroups && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(group)}
              >
                <IconTrash />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  })

  return managedColumns
}
