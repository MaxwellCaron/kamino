import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ClockIcon,
  Delete01Icon,
  LockPasswordIcon,
  MoreHorizontalIcon,
  NotebookIcon,
  PencilEdit01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

type GroupColumnsOptions = {
  canManageGroups: boolean
  canManageAccess: boolean
  canManageMemberships: boolean
  onEditClick: (group: ApiPrincipal) => void
  onEditGroups: (group: ApiPrincipal) => void
  onEditAccess: (group: ApiPrincipal) => void
  onDeleteClick: (group: ApiPrincipal) => void
}

export function getGroupColumns({
  canManageGroups,
  canManageAccess,
  canManageMemberships,
  onEditClick,
  onEditGroups,
  onEditAccess,
  onDeleteClick,
}: GroupColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  const columns: Array<ColumnDef<ApiPrincipal>> = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={UserGroupIcon} title="Name" />
      ),
      cell: ({ row: { original: group } }) => (
        <p className="mx-3">
          {group.name}
        </p>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={NotebookIcon}
          title="Description"
        />
      ),
      cell: ({ row: { original: group } }) => (
        <p className="mx-3 text-wrap">
          {group.description || "—"}
        </p>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} icon={ClockIcon} title="Created" />
      ),
      cell: ({ row: { original: group } }) =>
        group.created_at ? (
          <RelativeTimeCard
            date={group.created_at}
            delay={50}
            closeDelay={150}
            className="mx-3"
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
      enableSorting: false,
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
    enableSorting: false,
    meta: { className: "w-0" },
    header: () => null,
    cell: ({ row: { original: group } }) => (
      <div className="flex justify-end pr-6">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs">
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {canManageGroups && (
              <DropdownMenuItem onClick={() => onEditClick(group)}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Edit
              </DropdownMenuItem>
            )}
            {canManageAccess && (
              <DropdownMenuItem onClick={() => onEditAccess(group)}>
                <HugeiconsIcon
                  icon={LockPasswordIcon}
                  className="text-muted-foreground"
                />
                Permissions
              </DropdownMenuItem>
            )}
            {canManageMemberships && (
              <DropdownMenuItem onClick={() => onEditGroups(group)}>
                <HugeiconsIcon
                  icon={UserGroupIcon}
                  className="text-muted-foreground"
                />
                Members
              </DropdownMenuItem>
            )}
            {canManageGroups && canManageAccess && <DropdownMenuSeparator />}
            {canManageGroups && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(group)}
              >
                <HugeiconsIcon icon={Delete01Icon} />
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
