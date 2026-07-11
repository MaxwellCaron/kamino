import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AddTeam02Icon,
  Cancel01Icon,
  Delete01Icon,
  ReloadIcon,
  Tick01Icon,
  UserIcon,
  UserMinusIcon,
} from "@hugeicons/core-free-icons"
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
import { formatPrincipalReference } from "@/components/principals/principal-label"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  deleteUser,
  disableUser,
  enableUser,
  principalProviderQueryOptions,
  triggerPrincipalSync,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { getUserColumns } from "@/features/principals/components/users/users-columns"
import { formatToastError } from "@/features/shared/utils/format"
import { AppActionButton } from "@/components/actions/app-action-button"
import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

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
  return formatPrincipalReference(user)
}

export function UsersPage() {
  const { user } = usersRouteApi.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: users,
    isLoading: isUsersLoading,
    error,
  } = useQuery({
    ...usersQueryOptions,
    enabled: canAdminister,
  })
  const {
    data: providerCapabilities,
    isLoading: isProviderLoading,
  } = useQuery({
    ...principalProviderQueryOptions,
    enabled: canAdminister,
  })
  const isLoading = isUsersLoading || isProviderLoading
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
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })
  const enableMutation = useMutation({
    mutationFn: enableUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })
  const disableMutation = useMutation({
    mutationFn: disableUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })

  const showDeleteToast = useCallback(
    (targets: Array<ApiPrincipal>, onAllSucceeded?: () => void) => {
      showUnitMutationToast({
        title: "Deleting",
        units: targets.map((target) => ({
          items: [
            {
              id: target.id,
              name: getUserLabel(target),
              successDescription: "Deleted",
            },
          ],
          run: async () => {
            const result = await deleteMutation.mutateAsync([target.id])
            return { failed: result.failed }
          },
        })),
        onSettled: (result) => {
          if (result.failed.length === 0) onAllSucceeded?.()
        },
      })
    },
    [deleteMutation]
  )

  const showEnabledToast = useCallback(
    (
      targets: Array<ApiPrincipal>,
      mode: "enable" | "disable",
      onAllSucceeded?: () => void
    ) => {
      showUnitMutationToast({
        title: mode === "enable" ? "Enabling" : "Disabling",
        units: targets.map((target) => ({
          items: [
            {
              id: target.id,
              name: getUserLabel(target),
              successDescription: mode === "enable" ? "Enabled" : "Disabled",
            },
          ],
          run: async () => {
            if (mode === "enable") {
              if (target.status === false) {
                await enableMutation.mutateAsync(target.id)
              }
            } else if (target.status !== false) {
              await disableMutation.mutateAsync(target.id)
            }
            return { failed: [] }
          },
        })),
        onSettled: (result) => {
          if (result.failed.length === 0) onAllSucceeded?.()
        },
      })
    },
    [disableMutation, enableMutation]
  )

  const columns = useMemo(
    () =>
      getUserColumns({
        canManage: canAdminister,
        canManageMemberships: providerCapabilities?.can_manage_memberships ?? true,
        canEnableUsers: providerCapabilities?.can_enable_users ?? false,
        canDisableUsers: providerCapabilities?.can_disable_users ?? false,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onEnableClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Enable User",
            icon: Tick01Icon,
            description: `Enable ${getUserLabel(targetUser)}?`,
            actionLabel: "Enable",
            variant: "default",
            onConfirm: () => showEnabledToast([targetUser], "enable"),
          }),
        onDisableClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Disable User",
            icon: Cancel01Icon,
            description: `Disable ${getUserLabel(targetUser)}? Active sessions will be revoked.`,
            actionLabel: "Disable",
            variant: "destructive",
            onConfirm: () => showEnabledToast([targetUser], "disable"),
          }),
        onDeleteClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Delete User",
            icon: Delete01Icon,
            description: `Are you sure you want to delete ${getUserLabel(targetUser)}? This will permanently remove the user.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => showDeleteToast([targetUser]),
          }),
      }),
    [
      canAdminister,
      providerCapabilities?.can_manage_memberships,
      providerCapabilities?.can_enable_users,
      providerCapabilities?.can_disable_users,
      editDialog.openWith,
      membershipDialog.openWith,
      showDeleteToast,
      showEnabledToast,
    ]
  )

  const syncMutation = useMutation({
    mutationFn: triggerPrincipalSync,
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
              <HugeiconsIcon
                icon={UserIcon}
                className="size-7 text-muted-foreground"
              />
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
              {canAdminister && providerCapabilities?.can_sync ? (
                <AppActionButton
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={error !== null}
                  pending={syncMutation.isPending}
                  pendingLabel="Syncing..."
                >
                  <HugeiconsIcon icon={ReloadIcon} data-icon="inline-start" />
                  <span className="hidden lg:block">Sync</span>
                </AppActionButton>
              ) : null}
              {canAdminister && providerCapabilities?.can_create_users ? (
                <Button
                  onClick={() => setCreateOpen(true)}
                  disabled={error !== null}
                >
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  <span className="hidden lg:block">Create</span>
                </Button>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={users || []}
              features={{ loading: isLoading, sorting: true }}
              initialSorting={[{ id: "created_at", desc: true }]}
              error={error}
              getRowId={(tableUser: ApiPrincipal) => tableUser.id}
              selectionActions={
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
                          <HugeiconsIcon icon={AddTeam02Icon} />
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
                          <HugeiconsIcon icon={UserMinusIcon} />
                        </ActionBarItem>
                        <ActionBarSeparator />
                        {providerCapabilities?.can_enable_users ? (
                          <ActionBarItem
                            onSelect={(event) => event.preventDefault()}
                            onClick={() => showEnabledToast(selectedRows, "enable")}
                            aria-label="Enable selected users"
                            tooltip="Enable users"
                            variant="default"
                          >
                            <HugeiconsIcon icon={Tick01Icon} />
                          </ActionBarItem>
                        ) : null}
                        {providerCapabilities?.can_disable_users ? (
                          <ActionBarItem
                            variant="destructive"
                            onSelect={(event) => event.preventDefault()}
                            aria-label="Disable selected users"
                            tooltip="Disable users"
                            onClick={() =>
                              setConfirm({
                                title:
                                  selectedRows.length === 1
                                    ? "Disable User"
                                    : "Disable Users",
                                icon: Cancel01Icon,
                                description:
                                  selectedRows.length === 1
                                    ? `Disable ${getUserLabel(selectedRows[0])}? Active sessions will be revoked.`
                                    : `Disable ${selectedRows.length} users? Active sessions will be revoked.`,
                                actionLabel: "Disable",
                                variant: "destructive",
                                onConfirm: () =>
                                  showEnabledToast(
                                    selectedRows,
                                    "disable",
                                    clearSelection
                                  ),
                              })
                            }
                          >
                            <HugeiconsIcon icon={Cancel01Icon} />
                          </ActionBarItem>
                        ) : null}
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
                              icon: Delete01Icon,
                              description:
                                selectedRows.length === 1
                                  ? `Are you sure you want to delete ${getUserLabel(selectedRows[0])}? This will permanently remove the user.`
                                  : `Are you sure you want to delete ${selectedRows.length} users? This will permanently remove the selected users.`,
                              actionLabel: "Delete",
                              variant: "destructive",
                              onConfirm: () =>
                                showDeleteToast(selectedRows, clearSelection),
                            })
                          }
                        >
                          <HugeiconsIcon icon={Delete01Icon} />
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
          <UserDialog
            capabilities={providerCapabilities}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
        ) : null}
        {canAdminister && editDialog.data ? (
          <UserDialog
            key={`edit-${editDialog.dialogKey}`}
            capabilities={providerCapabilities}
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
