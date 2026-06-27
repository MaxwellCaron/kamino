import { useState } from "react"
import { toast } from "sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCubeOff } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ItemGroup } from "@workspace/ui/components/item"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ClonesTableSkeleton } from "./clones-table-skeleton"
import { PendingCloneStatusItem } from "./pending-clone-status-item"
import { PublishedPodCloneActionsMenu } from "./published-pod-clone-actions-menu"
import { PublishedPodCloneActionDialogs } from "./published-pod-clone-action-dialogs"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PendingCloneRow } from "@/features/pods/types/published-pods-types"
import type { PublishedPodClonePendingAction } from "./published-pod-clone-action-dialogs"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import {
  deletePublishedPodClone,
  podCatalogQueryOptions,
  powerPublishedPodClone,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  reclonePublishedPodClone,
} from "@/features/pods/api/publish-pod-api"
import { ClonedPodStatusBadge } from "@/features/pods/components/cloned-pod-status-badge"

export function PublishedPodClonesTable({
  pod,
  pendingRows,
  onDismissPendingRow,
}: {
  pod: PublishedPodCatalogEntry
  pendingRows: Array<PendingCloneRow>
  onDismissPendingRow: (progressId: string) => void
}) {
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] =
    useState<PublishedPodClonePendingAction>(null)

  const {
    data: clones,
    isLoading,
    error,
  } = useQuery(publishedPodClonesQueryOptions(pod.id))

  const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

  const powerMutation = useMutation({
    mutationFn: (params: {
      clonedPodId: string
      action: ClonedPodPowerAction
    }) => powerPublishedPodClone({ podId: pod.id, ...params }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      )
      setPendingAction(null)
      toast.success(
        pendingAction?.type === "start" ? "Clone started." : "Clone shut down."
      )
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update clone power state."
      )
    },
  })

  const recloneMutation = useMutation({
    mutationFn: (clonedPodId: string) =>
      reclonePublishedPodClone({ podId: pod.id, clonedPodId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      )
      setPendingAction(null)
      toast.success("Clone re-cloned.")
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error ? err.message : "Failed to re-clone clone."
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (clonedPodId: string) =>
      deletePublishedPodClone({ podId: pod.id, clonedPodId }),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.filter((c) => c.id !== deletedId) ?? []
      )
      void queryClient.invalidateQueries({
        queryKey: publishedPodsQueryOptions.queryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setPendingAction(null)
      toast.success("Clone deleted.")
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error ? err.message : "Failed to delete clone."
      )
    },
  })

  const isMutating =
    powerMutation.isPending ||
    recloneMutation.isPending ||
    deleteMutation.isPending

  return (
    <div>
      {isLoading ? (
        <ClonesTableSkeleton />
      ) : error ? (
        <InlineErrorAlert
          error={error}
          fallback="Failed to load clones."
          className="mx-4 my-3"
        />
      ) : (
        <>
          {pendingRows.length > 0 && (
            <ItemGroup
              role="list"
              className="grid p-6 md:grid-cols-2 xl:grid-cols-3"
            >
              {pendingRows.map((row) => (
                <PendingCloneStatusItem
                  key={row.progressId}
                  row={row}
                  onDismiss={onDismissPendingRow}
                />
              ))}
            </ItemGroup>
          )}
          {clones && clones.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-7">Principal</TableHead>
                    <TableHead>Cloned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>VMs</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clones.map((clone) => (
                    <TableRow key={clone.id} className="hover:bg-muted/50">
                      <TableCell className="pl-7">
                        <div className="flex items-center gap-2">
                          <span className="max-w-48 truncate text-sm font-medium">
                            {clone.owner.label}
                          </span>
                          <Badge variant="outline" className="w-fit text-xs">
                            {clone.owner.type.charAt(0).toUpperCase() +
                              clone.owner.type.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <RelativeTimeCard
                          date={clone.cloned_at}
                          delay={50}
                          closeDelay={150}
                        />
                      </TableCell>
                      <TableCell>
                        <ClonedPodStatusBadge status={clone.status} />
                      </TableCell>
                      <TableCell>{clone.network.vnet}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {clone.vm_count}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="tabular-nums">
                          {clone.task_summary.completed}/
                          {clone.task_summary.total}
                        </span>
                        {clone.task_summary.total > 0 && (
                          <span className="ml-1.5 text-muted-foreground tabular-nums">
                            {Math.round(clone.task_summary.progress)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-7">
                        <PublishedPodCloneActionsMenu
                          clone={clone}
                          isMutating={isMutating}
                          onAction={setPendingAction}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : pendingRows.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCubeOff className="text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>No clones yet</EmptyTitle>
                <EmptyDescription>
                  No users have cloned this pod.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </>
      )}

      <PublishedPodCloneActionDialogs
        pendingAction={pendingAction}
        isMutating={isMutating}
        onPowerConfirm={(clone, action) =>
          powerMutation.mutate({ clonedPodId: clone.id, action })
        }
        onRecloneConfirm={(clone) => recloneMutation.mutate(clone.id)}
        onDeleteConfirm={(clone) => deleteMutation.mutate(clone.id)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
      />
    </div>
  )
}
