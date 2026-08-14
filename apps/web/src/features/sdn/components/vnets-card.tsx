import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  Refresh03Icon,
} from "@hugeicons/core-free-icons"
import { ActionBarItem } from "@workspace/ui/components/action-bar"
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
import { DataTable } from "@/components/data-table/data-table"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import {
  applySDN,
  deleteVNet,
  vnetsQueryOptions,
} from "@/features/sdn/api/sdn-api"
import { getVNetColumns } from "@/features/sdn/components/vnets-columns"
import { VNetDialog } from "@/features/sdn/components/vnet-dialog"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"

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

export function VNetsCard({
  canAdminister,
  setConfirm,
}: {
  canAdminister: boolean
  setConfirm: (config: ConfirmConfig) => void
}) {
  const queryClient = useQueryClient()
  const {
    data: vnets,
    isLoading,
    error,
  } = useQuery({ ...vnetsQueryOptions, enabled: canAdminister })

  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<ApiVNet>()

  const applyMutation = useMutation({
    mutationFn: applySDN,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vnetsQueryOptions.queryKey })
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
              const failed: Array<{ id: string; error: string }> = []
              let deletedCount = 0

              for (const target of targets) {
                try {
                  // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential Proxmox SDN writes
                  const result = await deleteVNet([target.vnet], {
                    apply: false,
                  })
                  const failure = result.failed.find(
                    (item) => item.id === target.vnet
                  )
                  if (failure) {
                    failed.push(failure)
                    report({
                      id: target.vnet,
                      status: "error",
                      error: failure.error,
                    })
                  } else {
                    deletedCount += 1
                    report({ id: target.vnet, status: "done" })
                  }
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : "delete failed"
                  failed.push({ id: target.vnet, error: message })
                  report({ id: target.vnet, status: "error", error: message })
                }
              }

              if (deletedCount === 0) {
                report({
                  id: SDN_APPLY_ITEM_ID,
                  status: "error",
                  error: "Skipped because no VNets were deleted",
                })
                return { failed }
              }

              await reportSDNApply(report)
              return { failed }
            },
          },
        ],
        onSettled: (result) => {
          queryClient.invalidateQueries({
            queryKey: vnetsQueryOptions.queryKey,
          })
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
    [canAdminister, editDialog.openWith, setConfirm, showDeleteToast]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          VNets
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
                <HugeiconsIcon icon={Refresh03Icon} data-icon="inline-start" />
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
          searchLabel="Search virtual networks"
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
                          showDeleteToast(selectedRows, clearTableSelection),
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

      <>
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
      </>
    </Card>
  )
}
