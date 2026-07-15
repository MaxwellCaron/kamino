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
  Cancel01Icon,
  ClockIcon,
  Delete01Icon,
  MoreHorizontalIcon,
  NotebookIcon,
  PencilEdit01Icon,
  Tick01Icon,
  UserAccountIcon,
  UserGroupIcon,
  UserIcon,
  UserQuestion01Icon,
} from "@hugeicons/core-free-icons"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { EnabledBadge } from "@workspace/ui/components/enabled-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { getPrincipalBaseName } from "@/components/principals/principal-label"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

type UserColumnsOptions = {
  canManage: boolean
  canManageMemberships: boolean
  canEnableUsers: boolean
  canDisableUsers: boolean
  onEditClick: (user: ApiPrincipal) => void
  onEditGroups: (user: ApiPrincipal) => void
  onEnableClick: (user: ApiPrincipal) => void
  onDisableClick: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  canManage,
  canManageMemberships,
  canEnableUsers,
  canDisableUsers,
  onEditClick,
  onEditGroups,
  onEnableClick,
  onDisableClick,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  const columns: Array<ColumnDef<ApiPrincipal>> = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={UserIcon}
          title="Username"
        />
      ),
      cell: ({ row: { original: user } }) => (
        <div className="mx-3 flex items-center gap-3">
          <FacehashIcon name={getPrincipalBaseName(user)} size={32} />
          <div className="flex min-w-0 flex-col gap-0.5">
            {getPrincipalBaseName(user)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "full_name",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={UserAccountIcon}
          title="Full Name"
        />
      ),
      cell: ({ row: { original: user } }) => (
        <p className="mx-3 text-wrap">
          {user.full_name?.trim() ? user.full_name : <span>—</span>}
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
      cell: ({ row: { original: user } }) => (
        <p className="mx-3 text-wrap">{user.description ?? "—"}</p>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={ClockIcon}
          title="Created"
        />
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
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          icon={UserQuestion01Icon}
          title="Status"
        />
      ),
      cell: ({ row: { original: user } }) => (
        <div className="mx-3">
          <EnabledBadge value={user.status} />
        </div>
      ),
    },
  ]

  if (!canManage) {
    return columns
  }

  return [
    {
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
    },
    ...columns,
    {
      id: "actions",
      enableSorting: false,
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: user } }) => (
        <div className="flex justify-end pr-6">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Open actions for user ${user.name ?? user.external_id}`}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditClick(user)}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Edit
              </DropdownMenuItem>
              {canManageMemberships ? (
                <DropdownMenuItem onClick={() => onEditGroups(user)}>
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    className="text-muted-foreground"
                  />
                  Groups
                </DropdownMenuItem>
              ) : null}
              {canEnableUsers && user.status === false ? (
                <DropdownMenuItem onClick={() => onEnableClick(user)}>
                  <HugeiconsIcon
                    icon={Tick01Icon}
                    className="text-muted-foreground"
                  />
                  Enable
                </DropdownMenuItem>
              ) : null}
              {canDisableUsers && user.status !== false ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDisableClick(user)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                  Disable
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteClick(user)}
              >
                <HugeiconsIcon icon={Delete01Icon} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
}
