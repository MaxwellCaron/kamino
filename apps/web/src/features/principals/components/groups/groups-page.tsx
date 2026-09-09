import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  ReloadIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
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
import type {
  ApiPrincipal,
  ApiPrincipalProviderCapabilities,
} from "@/features/principals/types/principals-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
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
import { GroupDialog } from "@/features/principals/components/groups/group-dialog"
import { GroupPermissionsDialog } from "@/features/principals/components/groups/group-permissions-dialog"
import { MembershipDialog } from "@/features/principals/components/membership-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"

const groupsRouteApi = getRouteApi("/_dashboard/admin/principals/groups")

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
}

type PrincipalDialogState = ReturnType<typeof useItemDialogState<ApiPrincipal>>

function GroupsPageContent({
  canAdminister,
  columns,
  error,
  groups,
  isLoading,
  onCreate,
  onDeleteGroups,
  onOpenConfirm,
  onSync,
  providerCapabilities,
  syncPending,
}: {
  canAdminister: boolean
  columns: ReturnType<typeof getGroupColumns>
  error: Error | null
  groups: Array<ApiPrincipal> | undefined
  isLoading: boolean
  onCreate: () => void
  onDeleteGroups: (
    groups: Array<ApiPrincipal>,
    onAllSucceeded?: () => void
  ) => void
  onOpenConfirm: (config: ConfirmConfig) => void
  onSync: () => void
  providerCapabilities: ApiPrincipalProviderCapabilities | undefined
  syncPending: boolean
}) {
  if (isLoading) return null

  const groupCountLabel = error ? "!" : String(groups?.length ?? 0)

  return (
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
                onClick={() =>
                  onOpenConfirm({
                    title: "Sync Principals",
                    icon: ReloadIcon,
                    description:
                      "Kamino will reconcile users, groups, and memberships with the configured principal provider. Principals no longer returned by the provider will be removed from Kamino.",
                    actionLabel: "Sync",
                    variant: "default",
                    onConfirm: onSync,
                  })
                }
                pending={syncPending}
              >
                <HugeiconsIcon icon={ReloadIcon} data-icon="inline-start" />
                Sync
              </AppActionButton>
            ) : null}
            {canAdminister && providerCapabilities?.can_create_groups ? (
              <Button onClick={onCreate}>
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
                ? ({ clearSelection, selectedRows }) => (
                    <ActionBarItem
                      variant="destructive"
                      onSelect={(event) => event.preventDefault()}
                      onClick={() =>
                        onOpenConfirm({
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
                            onDeleteGroups(selectedRows, clearSelection),
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
  )
}

function GroupsPageDialogs({
  accessDialog,
  canAdminister,
  confirm,
  createOpen,
  editDialog,
  membershipDialog,
  onConfirmClose,
  onCreateOpenChange,
}: {
  accessDialog: PrincipalDialogState
  canAdminister: boolean
  confirm: ConfirmConfig | null
  createOpen: boolean
  editDialog: PrincipalDialogState
  membershipDialog: PrincipalDialogState
  onConfirmClose: () => void
  onCreateOpenChange: (open: boolean) => void
}) {
  return (
    <>
      {canAdminister && createOpen ? (
        <GroupDialog open={createOpen} onOpenChange={onCreateOpenChange} />
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
      {confirm ? (
        <ConfirmDialog config={confirm} onClose={onConfirmClose} />
      ) : null}
    </>
  )
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
  const { data: providerCapabilities, isLoading: isProviderLoading } = useQuery(
    {
      ...principalProviderQueryOptions,
      enabled: canAdminister,
    }
  )
  const isLoading = isGroupsLoading || isProviderLoading
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
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
  })

  const showSyncToast = useCallback(() => {
    showSingleMutationToast({
      title: "Syncing",
      name: "Principals",
      promise: () => syncMutation.mutateAsync(),
      successDescription: "Synced",
    })
  }, [syncMutation])

  const columns = useMemo(
    () =>
      getGroupColumns({
        canManageGroups: canAdminister,
        canManageAccess: canAdminister,
        canManageMemberships:
          providerCapabilities?.can_manage_memberships ?? true,
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
      <GroupsPageContent
        canAdminister={canAdminister}
        columns={columns}
        error={error}
        groups={groups}
        isLoading={isLoading}
        onCreate={() => setCreateOpen(true)}
        onDeleteGroups={showDeleteToast}
        onOpenConfirm={setConfirm}
        onSync={showSyncToast}
        providerCapabilities={providerCapabilities}
        syncPending={syncMutation.isPending}
      />
      <GroupsPageDialogs
        accessDialog={accessDialog}
        canAdminister={canAdminister}
        confirm={confirm}
        createOpen={createOpen}
        editDialog={editDialog}
        membershipDialog={membershipDialog}
        onConfirmClose={() => setConfirm(null)}
        onCreateOpenChange={setCreateOpen}
      />
    </div>
  )
}
