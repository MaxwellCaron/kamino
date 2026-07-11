import { Suspense, lazy, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  ReloadIcon,
  Tick01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
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
  principalProviderQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { getUserColumns } from "@/features/principals/components/users/users-columns"
import { useUsersPageMutations } from "@/features/principals/hooks/use-users-page-mutations"
import { UsersSelectionActions } from "@/features/principals/components/users/users-selection-actions"
import { AppActionButton } from "@/components/actions/app-action-button"
import { DataTable } from "@/components/data-table/data-table"
import { PreloadOverlay } from "@/components/loading-overlay"
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
  const { syncMutation, showDeleteToast, showEnabledToast } =
    useUsersPageMutations()

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
            description: `Enable ${formatPrincipalReference(targetUser)}?`,
            actionLabel: "Enable",
            variant: "default",
            onConfirm: () => showEnabledToast([targetUser], "enable"),
          }),
        onDisableClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Disable User",
            icon: Cancel01Icon,
            description: `Disable ${formatPrincipalReference(targetUser)}? Active sessions will be revoked.`,
            actionLabel: "Disable",
            variant: "destructive",
            onConfirm: () => showEnabledToast([targetUser], "disable"),
          }),
        onDeleteClick: (targetUser: ApiPrincipal) =>
          setConfirm({
            title: "Delete User",
            icon: Delete01Icon,
            description: `Are you sure you want to delete ${formatPrincipalReference(targetUser)}? This will permanently remove the user.`,
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

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isLoading} label="Loading users" />
      {!isLoading && (
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
                      <UsersSelectionActions
                        clearSelection={clearSelection}
                        selectedRows={selectedRows}
                        canEnableUsers={
                          providerCapabilities?.can_enable_users ?? false
                        }
                        canDisableUsers={
                          providerCapabilities?.can_disable_users ?? false
                        }
                        onAddToGroup={bulkGroupDialog.openWith}
                        onEnableUsers={(usr) => showEnabledToast(usr, "enable")}
                        onDisableUsers={(usr, clear) =>
                          showEnabledToast(usr, "disable", clear)
                        }
                        onDeleteUsers={showDeleteToast}
                        onConfirm={setConfirm}
                      />
                    )
                  : undefined
              }
            />
          </CardContent>
        </Card>
        </div>
      )}

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