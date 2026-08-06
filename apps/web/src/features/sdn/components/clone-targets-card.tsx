import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete01Icon, RouterIcon } from "@hugeicons/core-free-icons"
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
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  deletePodCloneTarget,
  podCloneTargetsQueryOptions,
} from "@/features/pods/api/clone-targets-api"
import { getCloneTargetColumns } from "@/features/sdn/components/clone-targets-columns"
import { useItemDialogState } from "@/features/shared/hooks/use-item-dialog-state"

const CloneTargetDialog = lazy(() =>
  import("@/features/sdn/components/clone-target-dialog").then((module) => ({
    default: module.CloneTargetDialog,
  }))
)

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

  const targetCountLabel = error ? "!" : String(targets?.length ?? 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={RouterIcon}
            className="size-7 text-muted-foreground"
          />
          <h2 className="scroll-m-20 text-2xl font-bold tracking-tight text-balance">
            Pod Clone Targets
          </h2>
          <Badge variant="outline" className="tabular-nums">
            {targetCountLabel}
          </Badge>
        </CardTitle>
        <CardDescription>
          Subnets and bridges that published pods can be cloned onto. Each pod is
          bound to one target when it is published.
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

      <Suspense fallback={null}>
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
      </Suspense>
    </Card>
  )
}
