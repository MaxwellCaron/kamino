import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  Globe02Icon,
  Refresh03Icon,
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
import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { MutationItemUpdate } from "@/components/feedback/mutation-progress-toast"

import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  applySDN,
  deleteVNet,
  sdnZonesQueryOptions,
  vnetsQueryOptions,
} from "@/features/sdn/api/sdn-api"
import { getVNetColumns } from "@/features/sdn/components/vnets-columns"
import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"

const sdnRouteApi = getRouteApi("/_dashboard/admin/sdn")
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

const SDN_APPLY_ITEM_ID = "sdn-apply"

function getVNetLabel(vnet: ApiVNet) {
  return vnet.vnet
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed"
}

function getSDNApplyProgressItem() {
  return {
    id: SDN_APPLY_ITEM_ID,
    name: "SDN Apply",
    successDescription: "Applied",
    retry: applySDN,
  }
}

async function reportSDNApply(report: (update: MutationItemUpdate) => void) {
  try {
    await applySDN()
    report({ id: SDN_APPLY_ITEM_ID, status: "done" })
  } catch (error) {
    report({
      id: SDN_APPLY_ITEM_ID,
      status: "error",
      error: getErrorMessage(error),
    })
  }
}

export function SdnPage() {
  const { user } = sdnRouteApi.useRouteContext()
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
  useQuery({ ...sdnZonesQueryOptions, enabled: canAdminister })
  const vnetCountLabel = error ? "!" : String(vnets?.length ?? 0)
  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiVNet>()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const queryClient = useQueryClient()

  const applyMutation = useMutation({
    mutationFn: applySDN,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
    },
  })

  const showApplyToast = useCallback(() => {
    showSingleMutationToast({
      title: "Applying SDN",
      name: "SDN Apply",
      promise: () => applyMutation.mutateAsync(),
      successDescription: "Applied",
    })
  }, [applyMutation])

  const showDeleteToast = useCallback(
    (targets: Array<ApiVNet>, onAllSucceeded?: () => void) => {
      const targetIds = targets.map((vnet) => vnet.vnet)

      showUnitMutationToast({
        title: "Deleting",
        progressItems: [getSDNApplyProgressItem()],
        units: [
          {
            items: targets.map((vnet) => ({
              id: vnet.vnet,
              name: vnet.vnet,
              successDescription: "Deleted",
              retry: async () => {
                const result = await deleteVNet([vnet.vnet], { apply: false })
                const failure = result.failed.find(
                  (item) => item.id === vnet.vnet
                )
                if (failure) throw new Error(failure.error)
                await applySDN()
              },
            })),
            run: async (report) => {
              const result = await deleteVNet(targetIds, { apply: false })
              const errorsById = new Map(
                result.failed.map((failure) => [failure.id, failure.error])
              )
              for (const target of targets) {
                const itemError = errorsById.get(target.vnet)
                if (itemError) {
                  report({ id: target.vnet, status: "error", error: itemError })
                } else {
                  report({ id: target.vnet, status: "done" })
                }
              }

              if (result.deleted.length === 0) {
                report({
                  id: SDN_APPLY_ITEM_ID,
                  status: "error",
                  error: "Skipped because no VNets were deleted",
                })
                return { failed: result.failed }
              }

              await reportSDNApply(report)
              return { failed: result.failed }
            },
          },
        ],
        onSettled: (result) => {
          queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
          if (result.failed.length === 0) onAllSucceeded?.()
        },
      })
    },
    [queryClient]
  )

  const columns = useMemo(
    () =>
      getVNetColumns({
        canManage: canAdminister,
        onEditVnet: editDialog.openWith,
        onDeleteClick: (v) =>
          setConfirm({
            title: "Delete VNet",
            icon: Delete01Icon,
            description: `Are you sure you want to delete ${v.vnet}? This will apply the SDN configuration immediately.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => showDeleteToast([v]),
          }),
      }),
    [canAdminister, editDialog.openWith, showDeleteToast]
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
              <HugeiconsIcon
                icon={Globe02Icon}
                className="size-7 text-muted-foreground"
              />
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setConfirm({
                        title: "Apply SDN",
                        icon: Refresh03Icon,
                        description:
                          "Apply the current SDN configuration in Proxmox.",
                        actionLabel: "Apply",
                        onConfirm: showApplyToast,
                      })
                    }
                    disabled={error !== null}
                  >
                    <HugeiconsIcon
                      icon={Refresh03Icon}
                      data-icon="inline-start"
                    />
                    <span className="hidden lg:block">Apply SDN</span>
                  </Button>
                  <Button
                    onClick={() => setCreateOpen(true)}
                    disabled={error !== null}
                  >
                    <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                    <span className="hidden lg:block">Create</span>
                  </Button>
                </div>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={vnets || []}
              features={{ loading: isLoading, sorting: true }}
              initialSorting={[{ id: "tag", desc: false }]}
              error={error}
              getRowId={(vnet) => vnet.vnet}
              selectionActions={
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
                            icon: Delete01Icon,
                            description:
                              selectedRows.length === 1
                                ? `Are you sure you want to delete ${getVNetLabel(selectedRows[0])}? This will apply the SDN configuration immediately.`
                                : `Are you sure you want to delete ${selectedRows.length} VNets? This will apply the SDN configuration immediately.`,
                            actionLabel: "Delete",
                            variant: "destructive",
                            onConfirm: () =>
                              showDeleteToast(
                                selectedRows,
                                clearTableSelection
                              ),
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
