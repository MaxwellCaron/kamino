import { Suspense, lazy, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, createFileRoute } from "@tanstack/react-router"
import { IconNetwork, IconPlus, IconTrash } from "@tabler/icons-react"
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
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"

import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { deleteVNet, vnetsQueryOptions } from "@/features/sdn/api/sdn-api"
import { getVNetColumns } from "@/features/sdn/components/vnets-columns"
import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"
import {
  capitalizeFirstLetter,
  formatToastError,
} from "@/features/shared/utils/format"
import { pageTitle } from "@/features/shared/utils/page-title"

const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((module) => ({
    default: module.ConfirmDialog,
  }))
)
const VNetDialog = lazy(() =>
  import("@/features/sdn/components/vnet-dialog").then((module) => ({
    default: module.VNetDialog,
  }))
)

export const Route = createFileRoute("/_dashboard/admin/sdn")({
  head: () => pageTitle("SDN"),
  component: SdnPage,
})

function getVNetLabel(vnet: ApiVNet) {
  return vnet.vnet
}

function SdnPage() {
  const { user } = Route.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: vnets,
    isLoading,
    error,
  } = useQuery({
    ...vnetsQueryOptions,
    enabled: canAdminister,
  })
  const vnetCountLabel = error ? "!" : String(vnets?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiVNet>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: deleteVNet,
    onSuccess: (result) => {
      const deletedCount = result.deleted.length
      const failedCount = result.failed.length

      if (deletedCount > 0) {
        toast.success(
          deletedCount === 1 ? "VNet deleted" : `${deletedCount} VNets deleted`
        )
      }

      if (failedCount === 1) {
        toast.error(
          `Failed to delete ${result.failed[0].id}: ${capitalizeFirstLetter(result.failed[0].error)}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} VNets`)
      }

      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
    },
    onError: (err) => {
      toast.error(formatToastError(err))
    },
  })

  const columns = useMemo(
    () =>
      getVNetColumns({
        canManage: canAdminister,
        onEditVnet: editDialog.openWith,
        onDeleteClick: (v) =>
          setConfirm({
            title: "Delete VNet",
            icon: IconTrash,
            description: `Are you sure you want to delete ${v.vnet}? This will apply the SDN configuration immediately.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: async () => {
              await deleteMutation.mutateAsync([v.vnet])
            },
          }),
      }),
    [canAdminister, deleteMutation, editDialog.openWith]
  )

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  if (isLoading) {
    return <TablePageSkeleton titleWidth="w-32" />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconNetwork className="size-7 text-muted-foreground" />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                VNets
              </h1>
              <Badge variant="outline" className="tabular-nums">
                {vnetCountLabel}
              </Badge>
            </CardTitle>
            <CardDescription>List of VNets in proxmox.</CardDescription>
            <CardAction>
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
              data={vnets || []}
              isLoading={isLoading}
              error={error}
              getRowId={(vnet) => vnet.vnet}
              renderSelectionActions={
                canAdminister
                  ? ({ clearSelection: clearTableSelection, selectedRows }) => (
                      <ActionBarItem
                        variant="destructive"
                        onSelect={(event) => event.preventDefault()}
                        onClick={() =>
                          setConfirm({
                            title:
                              selectedRows.length === 1
                                ? "Delete VNet"
                                : "Delete VNets",
                            icon: IconTrash,
                            description:
                              selectedRows.length === 1
                                ? `Are you sure you want to delete ${getVNetLabel(selectedRows[0])}? This will apply the SDN configuration immediately.`
                                : `Are you sure you want to delete ${selectedRows.length} VNets? This will apply the SDN configuration immediately.`,
                            actionLabel: "Delete",
                            variant: "destructive",
                            onConfirm: async () => {
                              const result = await deleteMutation.mutateAsync(
                                selectedRows.map(
                                  (selectedVNet) => selectedVNet.vnet
                                )
                              )
                              if (result.failed.length === 0) {
                                clearTableSelection()
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
          <VNetDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}

        {canAdminister && editDialog.data ? (
          <VNetDialog
            key={editDialog.dialogKey}
            vnet={editDialog.data}
            open={editDialog.open}
            onOpenChange={editDialog.onOpenChange}
          />
        ) : null}

        {confirm && (
          <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
        )}
      </Suspense>
    </div>
  )
}
