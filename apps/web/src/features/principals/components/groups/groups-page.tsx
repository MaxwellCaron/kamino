import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  ReloadIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { ActionBarItem } from "@workspace/ui/components/action-bar"
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
import { AppActionButton } from "@/components/actions/app-action-button"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  deleteGroup,
  groupsQueryOptions,
  principalProviderQueryOptions,
  triggerPrincipalSync,
} from "@/features/principals/api/principals-api"
import { getGroupColumns } from "@/features/principals/components/groups/groups-columns"
import { formatToastError } from "@/features/shared/utils/format"
import { DataTable } from "@/components/data-table/data-table"
import { PreloadOverlay } from "@/components/loading-overlay"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

const groupsRouteApi = getRouteApi("/_dashboard/admin/principals/groups")
const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((module) => ({
    default: module.ConfirmDialog,
  }))
)
const GroupDialog = lazy(() =>
  import("@/features/principals/components/groups/group-dialog").then(
    (module) => ({
      default: module.GroupDialog,
    })
  )
)
const GroupPermissionsDialog = lazy(() =>
  import("@/features/principals/components/groups/group-permissions-dialog").then(
    (module) => ({
      default: module.GroupPermissionsDialog,
    })
  )
)
const MembershipDialog = lazy(() =>
  import("@/features/principals/components/membership-dialog").then(
    (module) => ({
      default: module.MembershipDialog,
    })
  )
)

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
}

export function GroupsPage() {
  const { user } = groupsRouteApi.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: groups,
    isLoading: isGroupsLoading,
    error,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: canAdminister,
  })
  const {
    data: providerCapabilities,
    isLoading: isProviderLoading,
  } = useQuery({
    ...principalProviderQueryOptions,
    enabled: canAdminister,
  })
  const isLoading = isGroupsLoading || isProviderLoading
  const groupCountLabel = error ? "!" : String(groups?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiPrincipal>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const membershipDialog = useItemDialogState<ApiPrincipal>()
  const accessDialog = useItemDialogState<ApiPrincipal>()
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "groups"] })
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
              name: getGroupLabel(target),
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

  const columns = useMemo(
    () =>
      getGroupColumns({
        canManageGroups: canAdminister,
        canManageAccess: canAdminister,
        canManageMemberships: providerCapabilities?.can_manage_memberships ?? true,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onEditAccess: accessDialog.openWith,
        onDeleteClick: (group: ApiPrincipal) =>
          setConfirm({
            title: "Delete Group",
            icon: Delete01Icon,
            description: `Are you sure you want to delete ${getGroupLabel(group)}? This will permanently remove the group.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => showDeleteToast([group]),
          }),
      }),
    [
      accessDialog.openWith,
      canAdminister,
      providerCapabilities?.can_manage_memberships,
      editDialog.openWith,
      membershipDialog.openWith,
      showDeleteToast,
    ]
  )

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isLoading} label="Loading groups" />
      {!isLoading && (
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                icon={UserGroupIcon}
                className="size-7 text-muted-foreground"
              />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                Groups
              </h1>
              <Badge variant="outline" className="tabular-nums">
                {groupCountLabel}
              </Badge>
            </CardTitle>
            <CardDescription>
              List of groups from your principal provider.
            </CardDescription>
            <CardAction className="flex items-center gap-2">
              {canAdminister && providerCapabilities?.can_sync ? (
                <AppActionButton
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  pending={syncMutation.isPending}
                  pendingLabel="Syncing..."
                >
                  <HugeiconsIcon icon={ReloadIcon} data-icon="inline-start" />
                  Sync
                </AppActionButton>
              ) : null}
              {canAdminister && providerCapabilities?.can_create_groups ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  <span className="hidden lg:block">Create</span>
                </Button>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={groups || []}
              features={{ loading: isLoading, sorting: true }}
              initialSorting={[{ id: "created_at", desc: true }]}
              error={error}
              searchLabel="Search groups"
              getRowId={(group: ApiPrincipal) => group.id}
              selectionActions={
                canAdminister
                  ? ({
                      clearSelection,
                      selectedRows,
                    }: {
                      clearSelection: () => void
                      selectedRows: Array<ApiPrincipal>
                    }) => (
                      <ActionBarItem
                        variant="destructive"
                        onSelect={(event) => event.preventDefault()}
                        onClick={() =>
                          setConfirm({
                            title:
                              selectedRows.length === 1
                                ? "Delete Group"
                                : "Delete Groups",
                            icon: Delete01Icon,
                            description:
                              selectedRows.length === 1
                                ? `Are you sure you want to delete ${getGroupLabel(selectedRows[0])}? This will permanently remove the group.`
                                : `Are you sure you want to delete ${selectedRows.length} groups? This will permanently remove the selected groups.`,
                            actionLabel: "Delete",
                            variant: "destructive",
                            onConfirm: () =>
                              showDeleteToast(selectedRows, clearSelection),
                          })
                        }
                      >
                        <HugeiconsIcon
                          icon={Delete01Icon}
                          data-icon="inline-start"
                        />
                        Delete
                      </ActionBarItem>
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
          <GroupDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}
        {canAdminister && editDialog.data ? (
          <GroupDialog
            key={`edit-${editDialog.dialogKey}`}
            group={editDialog.data}
            open={editDialog.open}
            onOpenChange={editDialog.onOpenChange}
          />
        ) : null}

        {canAdminister && membershipDialog.data ? (
          <MembershipDialog
            key={`members-${membershipDialog.dialogKey}`}
            mode="group-members"
            principal={membershipDialog.data}
            open={membershipDialog.open}
            onOpenChange={membershipDialog.onOpenChange}
          />
        ) : null}
        {canAdminister && accessDialog.data ? (
          <GroupPermissionsDialog
            key={`access-${accessDialog.dialogKey}`}
            group={accessDialog.data}
            open={accessDialog.open}
            onOpenChange={accessDialog.onOpenChange}
          />
        ) : null}

        {confirm && (
          <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
        )}
      </Suspense>
    </div>
  )
}
