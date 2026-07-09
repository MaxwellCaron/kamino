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
  Delete01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { getPrincipalBaseName } from "@/components/principals/principal-label"

type UserColumnsOptions = {
  canManage: boolean
  canManageMemberships: boolean
  onEditClick: (user: ApiPrincipal) => void
  onEditGroups: (user: ApiPrincipal) => void
  onDeleteClick: (user: ApiPrincipal) => void
}

export function getUserColumns({
  canManage,
  canManageMemberships,
  onEditClick,
  onEditGroups,
  onDeleteClick,
}: UserColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  const columns: Array<ColumnDef<ApiPrincipal>> = [
    {
      accessorKey: "name",
      header: "Username",
      cell: ({ row: { original: user } }) => (
        <div className="flex items-center gap-3">
          <FacehashIcon name={getPrincipalBaseName(user)} size={32} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate font-medium">
              {getPrincipalBaseName(user)}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "full_name",
      header: "Full Name",
      cell: ({ row: { original: user } }) => (
        <p className="text-wrap text-foreground">
          {user.full_name?.trim() ? user.full_name : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      ),
    },
    {
      accessorKey: "description",
      header: () => <span className="pl-12">Description</span>,
      cell: ({ row: { original: user } }) => (
        <p className="pr-8 pl-12 text-wrap text-muted-foreground">
          {user.description ?? "—"}
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
