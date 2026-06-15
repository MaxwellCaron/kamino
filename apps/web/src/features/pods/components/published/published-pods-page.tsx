import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { uuid } from "@workspace/ui/lib/utils"
import {
  BulkCloneActionDialog,
  CloneForPrincipalsDialog,
  DeletePublishedPodDialog,
} from "./published-pod-dialogs"
import { PublishedPodsCatalogCard } from "./published-pods-catalog-card"
import { PublishedPodsHeaderCard } from "./published-pods-header-card"
import { PublishedPodsPageSkeleton } from "./published-pods-skeleton"
import { getPublishedPodsColumns } from "./published-pods-columns"
import type {
  PendingCloneBulkAction,
  PendingPrincipalCloneRow,
} from "../../types/published-pods-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import {
  bulkActionPublishedPodClones,
  createPublishedPodClone,
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
  const [pendingCloneForPrincipalsPod, setPendingCloneForPrincipalsPod] =
    useState<PublishedPodCatalogEntry | null>(null)
  const [pendingCloneRowsByPodId, setPendingCloneRowsByPodId] = useState<
    Record<string, Array<PendingPrincipalCloneRow>>
  >({})

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

  const handleDismissPendingCloneRow = useCallback(
    (podId: string, progressId: string) => {
      setPendingCloneRowsByPodId((prev) => {
        const rows = prev[podId] ?? []
        const next = rows.filter((r) => r.progressId !== progressId)
        if (next.length === 0) {
          const { [podId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [podId]: next }
      })
    },
    []
  )

  const handleCloneForPrincipals = useCallback(
    async (pod: PublishedPodCatalogEntry, principals: Array<PrincipalOption>) => {
      const rows: Array<PendingPrincipalCloneRow> = principals.map((p) => ({
        progressId: uuid(),
        principal: p,
        state: "queued" as const,
      }))

      setPendingCloneRowsByPodId((prev) => ({
        ...prev,
        [pod.id]: [...(prev[pod.id] ?? []), ...rows],
      }))

      const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

      let succeeded = 0
      let failed = 0

      for (const row of rows) {
        setPendingCloneRowsByPodId((prev) => ({
          ...prev,
          [pod.id]: (prev[pod.id] ?? []).map((r) =>
            r.progressId === row.progressId ? { ...r, state: "running" as const } : r
          ),
        }))

        try {
          const summary = await createPublishedPodClone({
            podId: pod.id,
            principalId: row.principal.id,
            progressId: row.progressId,
          })
          queryClient.setQueryData(
            clonesQueryKey,
            (current: Array<PublishedPodCloneSummary> | undefined) => {
              if (!current) return [summary]
              const exists = current.some((c) => c.id === summary.id)
              return exists
                ? current.map((c) => (c.id === summary.id ? summary : c))
                : [...current, summary]
            }
          )
          void queryClient.invalidateQueries({
            queryKey: publishedPodsQueryOptions.queryKey,
          })
          void queryClient.invalidateQueries({
            queryKey: podCatalogQueryOptions.queryKey,
          })
          setPendingCloneRowsByPodId((prev) => ({
            ...prev,
            [pod.id]: (prev[pod.id] ?? []).filter(
              (r) => r.progressId !== row.progressId
            ),
          }))
          succeeded++
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Clone failed."
          setPendingCloneRowsByPodId((prev) => ({
            ...prev,
            [pod.id]: (prev[pod.id] ?? []).map((r) =>
              r.progressId === row.progressId
                ? { ...r, state: "error" as const, message }
                : r
            ),
          }))
          failed++
        }
      }

      if (failed === 0) {
        toast.success(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}.`
        )
      } else if (succeeded === 0) {
        toast.error("Failed to clone pod for the selected principals.")
      } else {
        toast.warning(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}; ${failed} failed.`
        )
      }
    },
    [queryClient]
  )

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
        onCloneForPrincipals: setPendingCloneForPrincipalsPod,
      }),
    [navigate, statusMutation, bulkCloneActionMutation.isPending]
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
          onDismissPendingCloneRow={handleDismissPendingCloneRow}
        />
      </div>

      <DeletePublishedPodDialog
        isPending={deleteMutation.isPending}
        onConfirm={(pod) => deleteMutation.mutate(pod.id)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDeletePod(null)
        }}
        pod={pendingDeletePod}
      />
      <BulkCloneActionDialog
        isPending={bulkCloneActionMutation.isPending}
        onConfirm={(action) => bulkCloneActionMutation.mutate(action)}
        onOpenChange={(open) => {
          if (!open && !bulkCloneActionMutation.isPending) {
            setPendingCloneBulkAction(null)
          }
        }}
        pendingAction={pendingCloneBulkAction}
      />
      <CloneForPrincipalsDialog
        pod={pendingCloneForPrincipalsPod}
        open={pendingCloneForPrincipalsPod !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCloneForPrincipalsPod(null)
        }}
        pendingRowsByPodId={pendingCloneRowsByPodId}
        onConfirm={(pod, principals) => {
          void handleCloneForPrincipals(pod, principals)
        }}
      />
    </div>
  )
}
