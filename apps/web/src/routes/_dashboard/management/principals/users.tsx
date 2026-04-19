import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUser,
  IconUsersMinus,
  IconUsersPlus,
} from "@tabler/icons-react"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import type { ApiPrincipal } from "@/lib/queries"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import {
  ManagementPermissionBits,
  deleteUser,
  hasManagementPermission,
  triggerADSync,
  usersQueryOptions,
} from "@/lib/queries"
import { useItemDialogState } from "@/hooks/use-item-dialog-state"
import { UserDialog } from "@/components/principals/users/user-dialog"
import { MembershipDialog } from "@/components/principals/membership-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { getUserColumns } from "@/components/principals/users/users-columns"
import { UserGroupBulkDialog } from "@/components/principals/users/user-group-bulk-dialog"

export const Route = createFileRoute("/_dashboard/management/principals/users")(
  {
    component: UsersPage,
  }
)

function getUserLabel(user: ApiPrincipal) {
  return user.name ?? user.external_id
}

function UsersPage() {
  const { user } = Route.useRouteContext()
  const canView = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionBits.viewPrincipals
  )
  const canManage = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionBits.managePrincipals
  )
  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    ...usersQueryOptions,
    enabled: canView,
  })
  const userCountLabel = isLoading
    ? "..."
    : error
      ? "!"
      : String(users?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiPrincipal>()
  const bulkGroupDialog = useItemDialogState<{
    clearSelection: () => void
    mode: "add" | "remove"
    users: Array<ApiPrincipal>
  }>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const membershipDialog = useItemDialogState<ApiPrincipal>()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (result) => {
      const deletedCount = result.deleted.length
      const failedCount = result.failed.length

      if (deletedCount > 0) {
        toast.success(
          deletedCount === 1 ? "User deleted" : `${deletedCount} users deleted`
        )
      }

      if (failedCount === 1) {
        toast.error(
          `Failed to delete ${result.failed[0].id}: ${result.failed[0].error}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} users`)
      }

      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const columns = useMemo(
    () =>
      getUserColumns({
        canManage,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onDeleteClick: (targetUser) =>
          setConfirm({
            title: "Delete User",
            description: `Are you sure you want to delete ${getUserLabel(targetUser)}? This will permanently remove the user.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: async () => {
              await deleteMutation.mutateAsync([targetUser.id])
            },
          }),
      }),
    [canManage, deleteMutation, editDialog.openWith, membershipDialog.openWith]
  )

  const syncMutation = useMutation({
    mutationFn: triggerADSync,
    onSuccess: () => {
      toast.success("AD sync complete")
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  if (!canView) {
    return <Navigate to="/" />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUser className="size-7 text-muted-foreground" />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                Users
              </h1>
              <Badge variant="outline" className="tabular-nums">
                {userCountLabel}
              </Badge>
            </CardTitle>
            <CardDescription>
              List of users from your principal provider.
            </CardDescription>
            <CardAction className="space-x-2">
              {canManage && (
                <Button
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={
                    syncMutation.isPending || isLoading || error !== null
                  }
                >
                  <IconRefresh data-icon="inline-start" />
                  <span className="hidden lg:block">
                    {syncMutation.isPending ? "Syncing..." : "Sync"}
                  </span>
                </Button>
              )}
              {canManage && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  disabled={isLoading || error !== null}
                >
                  <IconPlus data-icon="inline-start" />
                  <span className="hidden lg:block">Create</span>
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={users || []}
              isLoading={isLoading}
              error={error}
              getRowId={(tableUser) => tableUser.id}
              renderSelectionActions={
                canManage
                  ? ({ clearSelection, selectedRows }) => (
                      <>
                        <ActionBarItem
                          onSelect={(event) => event.preventDefault()}
                          onClick={() =>
                            bulkGroupDialog.openWith({
                              clearSelection,
                              mode: "add",
                              users: selectedRows,
                            })
                          }
                          aria-label="Add selected users to a group"
                          tooltip="Add to group"
                          variant="default"
                        >
                          <IconUsersPlus />
                        </ActionBarItem>
                        <ActionBarItem
                          onSelect={(event) => event.preventDefault()}
                          onClick={() =>
                            bulkGroupDialog.openWith({
                              clearSelection,
                              mode: "remove",
                              users: selectedRows,
                            })
                          }
                          aria-label="Remove selected users from a group"
                          tooltip="Remove from group"
                          variant="destructive"
                        >
                          <IconUsersMinus />
                        </ActionBarItem>
                        <ActionBarSeparator />
                        <ActionBarItem
                          variant="destructive"
                          onSelect={(event) => event.preventDefault()}
                          aria-label="Delete selected users"
                          tooltip="Delete users"
                          onClick={() =>
                            setConfirm({
                              title:
                                selectedRows.length === 1
                                  ? "Delete User"
                                  : "Delete Users",
                              description:
                                selectedRows.length === 1
                                  ? `Are you sure you want to delete ${getUserLabel(selectedRows[0])}? This will permanently remove the user.`
                                  : `Are you sure you want to delete ${selectedRows.length} users? This will permanently remove the selected users.`,
                              actionLabel: "Delete",
                              variant: "destructive",
                              onConfirm: async () => {
                                const result = await deleteMutation.mutateAsync(
                                  selectedRows.map(
                                    (selectedUser) => selectedUser.id
                                  )
                                )
                                if (result.failed.length === 0) {
                                  clearSelection()
                                }
                              },
                            })
                          }
                        >
                          <IconTrash />
                        </ActionBarItem>
                      </>
                    )
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <UserDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {canManage && editDialog.data && (
        <UserDialog
          key={editDialog.dialogKey}
          user={editDialog.data}
          open={editDialog.open}
          onOpenChange={editDialog.onOpenChange}
        />
      )}

      {canManage && membershipDialog.data && (
        <MembershipDialog
          key={membershipDialog.dialogKey}
          mode="user-groups"
          principal={membershipDialog.data}
          open={membershipDialog.open}
          onOpenChange={membershipDialog.onOpenChange}
        />
      )}

      {canManage && bulkGroupDialog.data && (
        <UserGroupBulkDialog
          key={bulkGroupDialog.dialogKey}
          clearSelection={bulkGroupDialog.data.clearSelection}
          mode={bulkGroupDialog.data.mode}
          onOpenChange={bulkGroupDialog.onOpenChange}
          open={bulkGroupDialog.open}
          users={bulkGroupDialog.data.users}
        />
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
