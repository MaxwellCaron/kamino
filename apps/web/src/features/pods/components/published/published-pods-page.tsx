import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PublishedPodsCatalogCard } from "./published-pods-catalog-card"
import { PublishedPodsHeaderCard } from "./published-pods-header-card"
import { PublishedPodsPageSkeleton } from "./published-pods-skeleton"
import { getPublishedPodsColumns } from "./published-pods-columns"
import { PublishedPodsPageDialogs } from "./published-pods-page-dialogs"
import type { PendingCloneBulkAction } from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import { usePublishedPodsManagerClones } from "@/features/pods/hooks/use-published-pods-manager-clones"
import {
  bulkActionPublishedPodClones,
  deletePublishedPod,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  setPublishedPodStatus,
} from "@/features/pods/api/publish-pod-api"
import { POD_CLONE_ACTION_CONFIG } from "@/features/pods/utils/pod-clone-actions"

export function PublishedPodsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    data: podsData,
    error: podsError,
    isLoading: isPodsLoading,
  } = useQuery(publishedPodsQueryOptions)
  const pods = podsData ?? []
  const [pendingDeletePod, setPendingDeletePod] =
    useState<PublishedPodCatalogEntry | null>(null)
  const [pendingCloneBulkAction, setPendingCloneBulkAction] =
    useState<PendingCloneBulkAction>(null)

  const {
    pendingCloneRowsByPodId,
    pendingManagerClonePod,
    setPendingManagerClonePod,
    handleDismissCloneRow,
    handleManagerClone,
  } = usePublishedPodsManagerClones()

  const statusMutation = useMutation({
    mutationFn: setPublishedPodStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData(
        publishedPodsQueryOptions.queryKey,
        pods.map((pod) => (pod.id === updated.id ? updated : pod))
      )
      toast.success(
        updated.status === "listed"
          ? `${updated.title} is now listed.`
          : `${updated.title} is now unlisted.`
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update published pod status."
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePublishedPod,
    onSuccess: (_, deletedPodID) => {
      queryClient.setQueryData(
        publishedPodsQueryOptions.queryKey,
        (current: Array<PublishedPodCatalogEntry> | undefined) =>
          current?.filter((pod) => pod.id !== deletedPodID) ?? []
      )
      queryClient.removeQueries({
        queryKey: ["pods", "published", deletedPodID],
      })
      void queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setPendingDeletePod(null)
      toast.success("Published Pod catalog entry deleted.")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete published Pod catalog entry."
      )
    },
  })

  const bulkCloneActionMutation = useMutation({
    mutationFn: (params: {
      pod: PublishedPodCatalogEntry
      action: PodCloneAction
    }) =>
      bulkActionPublishedPodClones({
        podId: params.pod.id,
        action: params.action,
      }),
    onSuccess: (result, { pod, action }) => {
      void queryClient.invalidateQueries({
        queryKey: publishedPodClonesQueryOptions(pod.id).queryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: publishedPodsQueryOptions.queryKey,
      })
      if (action === "delete") {
        void queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        })
      }
      setPendingCloneBulkAction(null)

      const actionConfig = POD_CLONE_ACTION_CONFIG[action]
      const succeeded = result.succeeded.length
      const failed = result.failed.length

      if (succeeded === 0 && failed === 0) {
        toast.success("No cloned instances to update.")
      } else if (failed === 0) {
        toast.success(
          `${actionConfig.label} applied to ${succeeded} cloned instance${succeeded === 1 ? "" : "s"}.`
        )
      } else {
        toast.warning(
          `${actionConfig.label} applied to ${succeeded} cloned instance${succeeded === 1 ? "" : "s"}; ${failed} failed.`
        )
      }
    },
    onError: (error) => {
      setPendingCloneBulkAction(null)
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to apply bulk clone action."
      )
    },
  })

  const stats = useMemo(() => {
    const publishedPods = podsData ?? []
    const listed = publishedPods.filter((pod) => pod.status === "listed").length
    const restricted = publishedPods.filter(
      (pod) => pod.audience.length > 0
    ).length
    const totalClones = publishedPods.reduce(
      (sum, pod) => sum + pod.clone_count,
      0
    )

    return {
      total: publishedPods.length,
      listed,
      unlisted: publishedPods.length - listed,
      restricted,
      totalClones,
    }
  }, [podsData])

  const columns = useMemo(
    () =>
      getPublishedPodsColumns({
        onDelete: setPendingDeletePod,
        onEdit: (pod) => {
          navigate({
            to: "/pods/publish",
            search: { podId: pod.id },
          })
        },
        onStatusChange: (pod, status) => {
          statusMutation.mutate({ id: pod.id, status })
        },
        onCloneBulkAction: (pod, action) => {
          setPendingCloneBulkAction({ pod, action })
        },
        cloneBulkActionPending: bulkCloneActionMutation.isPending,
        onManagerClone: setPendingManagerClonePod,
      }),
    [navigate, statusMutation, bulkCloneActionMutation.isPending, setPendingManagerClonePod]
  )

  if (isPodsLoading) {
    return <PublishedPodsPageSkeleton />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <PublishedPodsHeaderCard stats={stats} />
        <PublishedPodsCatalogCard
          columns={columns}
          error={podsError}
          isLoading={isPodsLoading}
          pods={pods}
          pendingCloneRowsByPodId={pendingCloneRowsByPodId}
          onDismissCloneRow={handleDismissCloneRow}
        />
      </div>

      <PublishedPodsPageDialogs
        pendingDeletePod={pendingDeletePod}
        isDeletePending={deleteMutation.isPending}
        onDeleteConfirm={(pod) => deleteMutation.mutate(pod.id)}
        onDeleteOpenChange={(open) => {
          if (!open) setPendingDeletePod(null)
        }}
        pendingCloneBulkAction={pendingCloneBulkAction}
        isBulkClonePending={bulkCloneActionMutation.isPending}
        onBulkCloneConfirm={(action) => bulkCloneActionMutation.mutate(action)}
        onBulkCloneOpenChange={(open) => {
          if (!open) setPendingCloneBulkAction(null)
        }}
        pendingManagerClonePod={pendingManagerClonePod}
        pendingCloneRowsByPodId={pendingCloneRowsByPodId}
        onManagerCloneOpenChange={(open) => {
          if (!open) setPendingManagerClonePod(null)
        }}
        onManagerCloneConfirm={(pod, principals) => {
          void handleManagerClone(pod, principals)
        }}
      />
    </div>
  )
}
