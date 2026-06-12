import { Suspense, lazy, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi  } from "@tanstack/react-router"
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUser,
  IconUsersMinus,
  IconUsersPlus,
} from "@tabler/icons-react"
import { toast } from "sonner"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  deleteUser,
  triggerADSync,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { getUserColumns } from "@/features/principals/components/users/users-columns"
import {
  capitalizeFirstLetter,
  formatToastError,
} from "@/features/shared/utils/format"

import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"

const usersRouteApi = getRouteApi("/_dashboard/admin/principals/users")
const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((module) => ({
    default: module.ConfirmDialog,
  }))
)
const MembershipDialog = lazy(() =>
  import("@/features/principals/components/membership-dialog").then(
    (module) => ({
      default: module.MembershipDialog,
    })
  )
)
const UserDialog = lazy(() =>
  import("@/features/principals/components/users/user-dialog").then(
    (module) => ({
      default: module.UserDialog,
    })
  )
)
const UserGroupBulkDialog = lazy(() =>
  import("@/features/principals/components/users/user-group-bulk-dialog").then(
    (module) => ({
      default: module.UserGroupBulkDialog,
    })
  )
)

function getUserLabel(user: ApiPrincipal) {
  return user.name ?? user.external_id
}

export function UsersPage() {
  const { user } = usersRouteApi.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    ...usersQueryOptions,
    enabled: canAdminister,
  })
  const userCountLabel = error ? "!" : String(users?.length ?? 0)
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
  const userLabelsByID = useMemo(() => {
    return new Map(
      (users ?? []).map((principal) => [principal.id, getUserLabel(principal)])
    )
  }, [users])

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
        const failure = result.failed[0]
        const userLabel = userLabelsByID.get(failure.id) ?? failure.id
        toast.error(
          `Failed to delete ${userLabel}: ${capitalizeFirstLetter(failure.error)}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} users`)
      }

      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

  const columns = useMemo(
    () =>
      getUserColumns({
        canManage: canAdminister,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onDeleteClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Delete User",
            icon: IconTrash,
            description: `Are you sure you want to delete ${getUserLabel(targetUser)}? This will permanently remove the user.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: async () => {
              await deleteMutation.mutateAsync([targetUser.id])
            },
          }),
      }),
    [
      canAdminister,
      deleteMutation,
      editDialog.openWith,
      membershipDialog.openWith,
    ]
  )

  const syncMutation = useMutation({
    mutationFn: triggerADSync,
    onSuccess: () => {
      toast.success("Sync complete")
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  if (isLoading) {
    return <TablePageSkeleton actionCount={2} titleWidth="w-32" />
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
            <CardAction className="flex items-center gap-2">
              {canAdminister ? (
                <Button
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending || error !== null}
                >
                  <IconRefresh data-icon="inline-start" />
                  <span className="hidden lg:block">
                    {syncMutation.isPending ? "Syncing..." : "Sync"}
                  </span>
                </Button>
              ) : null}
              {canAdminister ? (
                <Button
                  onClick={() => setCreateOpen(true)}
                  disabled={error !== null}
                >
                  <IconPlus data-icon="inline-start" />
                  <span className="hidden lg:block">Create</span>
                </Button>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={users || []}
              isLoading={isLoading}
              error={error}
              getRowId={(tableUser: ApiPrincipal) => tableUser.id}
              renderSelectionActions={
                canAdminister
                  ? ({
                      clearSelection,
                      selectedRows,
                    }: {
                      clearSelection: () => void
                      selectedRows: Array<ApiPrincipal>
                    }) => (
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
                              icon: IconTrash,
                              description:
                                selectedRows.length === 1
                                  ? `Are you sure you want to delete ${getUserLabel(selectedRows[0])}? This will permanently remove the user.`
                                  : `Are you sure you want to delete ${selectedRows.length} users? This will permanently remove the selected users.`,
                              actionLabel: "Delete",
                              variant: "destructive",
                              onConfirm: async () => {
                                const result = await deleteMutation.mutateAsync(
                                  selectedRows.map(
                                    (selectedUser: ApiPrincipal) =>
                                      selectedUser.id
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

      <Suspense fallback={null}>
        {canAdminister && createOpen ? (
          <UserDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}
        {canAdminister && editDialog.data ? (
          <UserDialog
            key={`edit-${editDialog.dialogKey}`}
            user={editDialog.data}
            open={editDialog.open}
            onOpenChange={editDialog.onOpenChange}
          />
        ) : null}

        {canAdminister && membershipDialog.data ? (
          <MembershipDialog
            key={`members-${membershipDialog.dialogKey}`}
            mode="user-groups"
            principal={membershipDialog.data}
            open={membershipDialog.open}
            onOpenChange={membershipDialog.onOpenChange}
          />
        ) : null}

        {canAdminister && bulkGroupDialog.data ? (
          <UserGroupBulkDialog
            key={`bulk-${bulkGroupDialog.dialogKey}`}
            clearSelection={bulkGroupDialog.data.clearSelection}
            mode={bulkGroupDialog.data.mode}
            onOpenChange={bulkGroupDialog.onOpenChange}
            open={bulkGroupDialog.open}
            users={bulkGroupDialog.data.users}
          />
        ) : null}

        {confirm && (
          <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
        )}
      </Suspense>
    </div>
  )
}
