import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import type { AppTableFeatures } from "@/components/data-table/data-table-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { getPrincipalBaseName } from "@/components/principals/principal-label"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { createRowSelectionColumn } from "@/components/data-table/data-table-row-selection-column"

type UserColumnsOptions = {
  canManage: boolean
  canManageMemberships: boolean
  onEditClick: (user: ApiPrincipal) => void
  onEditGroups: (user: ApiPrincipal) => void
  onEnableClick: (user: ApiPrincipal) => void
  onDisableClick: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  canManage,
  canManageMemberships,
  onEditClick,
  onEditGroups,
  onEnableClick,
  onDisableClick,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<AppTableFeatures, ApiPrincipal>> {
  const columns: Array<ColumnDef<AppTableFeatures, ApiPrincipal>> = [
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
    createRowSelectionColumn<ApiPrincipal>((user) =>
      getPrincipalBaseName(user)
    ),
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
              <DropdownMenuGroup>
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
                {user.status === false ? (
                  <DropdownMenuItem onClick={() => onEnableClick(user)}>
                    <HugeiconsIcon
                      icon={Tick01Icon}
                      className="text-muted-foreground"
                    />
                    Enable
                  </DropdownMenuItem>
                ) : null}
                {user.status !== false ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDisableClick(user)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                    Disable
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDeleteClick(user)}
                >
                  <HugeiconsIcon icon={Delete01Icon} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
}
