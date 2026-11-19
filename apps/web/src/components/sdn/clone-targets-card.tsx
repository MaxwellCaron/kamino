import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  deletePodCloneTarget,
  podCloneTargetsQueryOptions,
} from "@/lib/pods/clone-targets-api"
import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { CloneTargetDialog } from "@/components/sdn/clone-target-dialog"
import type { ConfirmConfig } from "@/lib/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { HugeiconsIcon } from "@hugeicons/react"
import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"
import { getCloneTargetColumns } from "@/components/sdn/clone-targets-columns"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useItemDialogState } from "@/hooks/dialogs/use-item-dialog-state"

export function CloneTargetsCard({
  canAdminister,
  setConfirm,
}: {
  canAdminister: boolean
  setConfirm: (config: ConfirmConfig) => void
}) {
  const queryClient = useQueryClient()
  const {
    data: targets,
    isLoading,
    error,
  } = useQuery({ ...podCloneTargetsQueryOptions, enabled: canAdminister })

  const [createOpen, setCreateOpen] = useState(false)
  const editDialog = useItemDialogState<PodCloneTarget>()

  const deleteMutation = useMutation({
    mutationFn: deletePodCloneTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: podCloneTargetsQueryOptions.queryKey,
      })
    },
  })

  const showDeleteToast = useCallback(
    (target: PodCloneTarget) => {
      showSingleMutationToast({
        title: "Deleting clone target",
        name: target.label,
        promise: () => deleteMutation.mutateAsync(target.key),
        successDescription: "Deleted",
      })
    },
    [deleteMutation]
  )

  const columns = useMemo(
    () =>
      getCloneTargetColumns({
        canManage: canAdminister,
        onEdit: editDialog.openWith,
        onDeleteClick: (target) =>
          setConfirm({
            title: "Delete Clone Target",
            icon: Delete01Icon,
            description: `Are you sure you want to delete ${target.label}? Published pods and clones still using it must be moved or deleted first.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => showDeleteToast(target),
          }),
      }),
    [canAdminister, editDialog.openWith, setConfirm, showDeleteToast]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Pod Clone Targets
        </CardTitle>
        <CardDescription>
          Subnets and bridges that pods can be cloned onto. Assign targets for
          default cloning and personal pod provisioning from the edit dialog.
        </CardDescription>
        <CardAction>
          {canAdminister ? (
            <Button onClick={() => setCreateOpen(true)} disabled={!!error}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              <span className="hidden lg:block">Create</span>
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          columns={columns}
          data={targets || []}
          features={{ loading: isLoading, sorting: true }}
          error={error}
          searchLabel="Search clone targets"
          getRowId={(target) => target.key}
        />
      </CardContent>

      <>
        {canAdminister && createOpen ? (
          <CloneTargetDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}

        {canAdminister && editDialog.data ? (
          <CloneTargetDialog
            key={editDialog.dialogKey}
            target={editDialog.data}
            open={editDialog.open}
            onOpenChange={editDialog.onOpenChange}
          />
        ) : null}
      </>
    </Card>
  )
}
