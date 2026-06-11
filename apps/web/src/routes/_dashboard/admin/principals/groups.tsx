import { Suspense, lazy, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, createFileRoute } from "@tanstack/react-router"
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react"
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
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  deleteGroup,
  groupsQueryOptions,
  triggerADSync,
} from "@/features/principals/api/principals-api"
import { getGroupColumns } from "@/features/principals/components/groups/groups-columns"
import {
  capitalizeFirstLetter,
  formatToastError,
} from "@/features/shared/utils/format"
import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"
import { pageTitle } from "@/features/shared/utils/page-title"

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

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
  head: () => pageTitle("Groups"),
  component: GroupsPage,
})

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
}

function GroupsPage() {
  const { user } = Route.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: groups,
    isLoading,
    error,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: canAdminister,
  })
  const groupCountLabel = error ? "!" : String(groups?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiPrincipal>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const membershipDialog = useItemDialogState<ApiPrincipal>()
  const accessDialog = useItemDialogState<ApiPrincipal>()
  const queryClient = useQueryClient()
  const groupLabelsByID = useMemo(() => {
    return new Map(
      (groups ?? []).map((principal) => [
        principal.id,
        getGroupLabel(principal),
      ])
    )
  }, [groups])

  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: (result) => {
      const deletedCount = result.deleted.length
      const failedCount = result.failed.length

      if (deletedCount > 0) {
        toast.success(
          deletedCount === 1
            ? "Group deleted"
            : `${deletedCount} groups deleted`
        )
      }

      if (failedCount === 1) {
        const failure = result.failed[0]
        const groupLabel = groupLabelsByID.get(failure.id) ?? failure.id
        toast.error(
          `Failed to delete ${groupLabel}: ${capitalizeFirstLetter(failure.error)}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} groups`)
      }

      queryClient.invalidateQueries({ queryKey: ["principals", "groups"] })
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

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

  const columns = useMemo(
    () =>
      getGroupColumns({
        canManageGroups: canAdminister,
        canManageAccess: canAdminister,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onEditAccess: accessDialog.openWith,
        onDeleteClick: (group: ApiPrincipal) =>
          setConfirm({
            title: "Delete Group",
            icon: IconTrash,
            description: `Are you sure you want to delete ${getGroupLabel(group)}? This will permanently remove the group.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: async () => {
              await deleteMutation.mutateAsync([group.id])
            },
          }),
      }),
    [
      accessDialog.openWith,
      canAdminister,
      deleteMutation,
      editDialog.openWith,
      membershipDialog.openWith,
    ]
  )

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  if (isLoading) {
    return <TablePageSkeleton actionCount={2} titleWidth="w-40" />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUsersGroup className="size-7 text-muted-foreground" />
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
              {canAdminister ? (
                <Button
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <IconRefresh data-icon="inline-start" />
                  {syncMutation.isPending ? "Syncing..." : "Sync"}
                </Button>
              ) : null}
              {canAdminister ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <IconPlus data-icon="inline-start" />
                  <span className="hidden lg:block">Create</span>
                </Button>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={groups || []}
              isLoading={isLoading}
              error={error}
              getRowId={(group: ApiPrincipal) => group.id}
              renderSelectionActions={
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
                            icon: IconTrash,
                            description:
                              selectedRows.length === 1
                                ? `Are you sure you want to delete ${getGroupLabel(selectedRows[0])}? This will permanently remove the group.`
                                : `Are you sure you want to delete ${selectedRows.length} groups? This will permanently remove the selected groups.`,
                            actionLabel: "Delete",
                            variant: "destructive",
                            onConfirm: async () => {
                              const result = await deleteMutation.mutateAsync(
                                selectedRows.map(
                                  (selectedGroup: ApiPrincipal) =>
                                    selectedGroup.id
                                )
                              )
                              if (result.failed.length === 0) {
                                clearSelection()
                              }
                            },
                          })
                        }
                      >
                        <IconTrash data-icon="inline-start" />
                        Delete
                      </ActionBarItem>
                    )
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>

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
