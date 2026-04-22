import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react"
import { ActionBarItem } from "@workspace/ui/components/action-bar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import type { ApiPrincipal } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  deleteGroup,
  groupsQueryOptions,
  hasManagementPermission,
  triggerADSync,
} from "@/lib/queries"
import { useItemDialogState } from "@/hooks/use-item-dialog-state"
import { GroupDialog } from "@/components/principals/groups/group-dialog"
import { GroupPermissionsDialog } from "@/components/principals/groups/group-permissions-dialog"
import { MembershipDialog } from "@/components/principals/membership-dialog"
import { getGroupColumns } from "@/components/principals/groups/groups-columns"
import { DataTable } from "@/components/data-table/data-table"

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
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
  const groupCountLabel = isLoading
    ? "..."
    : error
      ? "!"
      : String(groups?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiPrincipal>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const membershipDialog = useItemDialogState<ApiPrincipal>()
  const accessDialog = useItemDialogState<ApiPrincipal>()
  const queryClient = useQueryClient()

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
        toast.error(
          `Failed to delete ${result.failed[0].id}: ${result.failed[0].error}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} groups`)
      }

      queryClient.invalidateQueries({ queryKey: ["principals", "groups"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

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

  const columns = useMemo(
    () =>
      getGroupColumns({
        canManageGroups: canAdminister,
        canManageAccess: canAdminister,
        onEditClick: editDialog.openWith,
        onEditGroups: membershipDialog.openWith,
        onEditAccess: accessDialog.openWith,
        onDeleteClick: (group) =>
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
              getRowId={(group) => group.id}
              renderSelectionActions={
                canAdminister
                  ? ({ clearSelection, selectedRows }) => (
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
                                  (selectedGroup) => selectedGroup.id
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

      {canAdminister ? (
        <GroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
      {canAdminister && editDialog.data ? (
        <GroupDialog
          key={editDialog.dialogKey}
          group={editDialog.data}
          open={editDialog.open}
          onOpenChange={editDialog.onOpenChange}
        />
      ) : null}

      {canAdminister && membershipDialog.data ? (
        <MembershipDialog
          key={membershipDialog.dialogKey}
          mode="group-members"
          principal={membershipDialog.data}
          open={membershipDialog.open}
          onOpenChange={membershipDialog.onOpenChange}
        />
      ) : null}
      {canAdminister && accessDialog.data ? (
        <GroupPermissionsDialog
          key={accessDialog.dialogKey}
          group={accessDialog.data}
          open={accessDialog.open}
          onOpenChange={accessDialog.onOpenChange}
        />
      ) : null}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
