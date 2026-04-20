import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { IconNetwork, IconPlus, IconTrash } from "@tabler/icons-react"
import { ActionBarItem } from "@workspace/ui/components/action-bar"
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
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import type { ApiVNet } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import {
  ManagementPermissionKeys,
  deleteVNet,
  hasManagementPermission,
  vnetsQueryOptions,
} from "@/lib/queries"
import { useItemDialogState } from "@/hooks/use-item-dialog-state"
import { VNetDialog } from "@/components/vnet/vnet-dialog"
import { getVNetColumns } from "@/components/vnet/vnets-columns"
import { DataTable } from "@/components/data-table/data-table"

export const Route = createFileRoute("/_dashboard/management/sdn")({
  component: SdnPage,
})

function getVNetLabel(vnet: ApiVNet) {
  return vnet.vnet
}

function SdnPage() {
  const { user } = Route.useRouteContext()
  const canView = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.infrastructureView
  )
  const canManage = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.infrastructureManage
  )
  const {
    data: vnets,
    isLoading,
    error,
  } = useQuery({
    ...vnetsQueryOptions,
    enabled: canView,
  })
  const vnetCountLabel = isLoading
    ? "..."
    : error
      ? "!"
      : String(vnets?.length ?? 0)
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
          `Failed to delete ${result.failed[0].id}: ${result.failed[0].error}`
        )
      } else if (failedCount > 1) {
        toast.error(`Failed to delete ${failedCount} VNets`)
      }

      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const columns = useMemo(
    () =>
      getVNetColumns({
        canManage,
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
    [canManage, deleteMutation, editDialog.openWith]
  )

  if (!canView) {
    return <Navigate to="/" />
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
              data={vnets || []}
              isLoading={isLoading}
              error={error}
              getRowId={(vnet) => vnet.vnet}
              renderSelectionActions={
                canManage
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

      {canManage && (
        <VNetDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

      {canManage && editDialog.data && (
        <VNetDialog
          key={editDialog.dialogKey}
          vnet={editDialog.data}
          open={editDialog.open}
          onOpenChange={editDialog.onOpenChange}
        />
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
