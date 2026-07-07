import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Delete01Icon } from "@hugeicons/core-free-icons"
import { PublishedPodsCatalogCard } from "./published-pods-catalog-card"
import { PublishedPodsHeaderCard } from "./published-pods-header-card"
import { PublishedPodsPageSkeleton } from "./published-pods-skeleton"
import { getPublishedPodsColumns } from "./published-pods-columns"
import { ManagerCloneDialog } from "./manager-clone-dialog"
import type { PendingCloneBulkAction } from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import {
  showMutationToast,
  showSingleMutationToast,
} from "@/components/feedback/mutation-progress-toast"
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

const BULK_CLONE_DIALOG_CONFIG: Record<
  PodCloneAction,
  {
    title: string
    description: (pod: PublishedPodCatalogEntry) => string
    variant: "default" | "destructive"
  }
> = {
  start: {
    title: "Start All Clones?",
    description: (pod) => `Start every cloned instance of "${pod.title}".`,
    variant: "default",
  },
  shutdown: {
    title: "Shutdown All Clones?",
    description: (pod) =>
      `Send a shutdown signal to every cloned instance of "${pod.title}".`,
    variant: "destructive",
  },
  reclone: {
    title: "Re-clone All Clones?",
    description: (pod) =>
      `Delete and recreate VMs for every cloned instance of "${pod.title}". Task progress and question answers stay.`,
    variant: "destructive",
  },
  delete: {
    title: "Delete All Clones?",
    description: (pod) =>
      `Permanently delete every cloned instance of "${pod.title}", including their VMs, inventory folders, and saved task progress.`,
    variant: "destructive",
  },
}

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
    pendingPrincipalIdsByPodId,
    pendingManagerClonePod,
    setPendingManagerClonePod,
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
    },
    onError: () => {
      setPendingDeletePod(null)
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
    onSuccess: (_, { pod, action }) => {
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
    },
    onError: () => {
      setPendingCloneBulkAction(null)
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
    [
      navigate,
      statusMutation,
      bulkCloneActionMutation.isPending,
      setPendingManagerClonePod,
    ]
  )

  const deleteConfirm: ConfirmConfig | null = pendingDeletePod
    ? {
        title: "Delete Catalog Entry?",
        description: `This deletes "${pendingDeletePod.title}" from the published catalog database only. The Pod Folder, Pod Template Folder, and Proxmox VMs are not deleted.`,
        actionLabel: "Delete",
        icon: Delete01Icon,
        variant: "destructive",
        onConfirm: () => {
          showSingleMutationToast({
            title: "Deleting",
            name: pendingDeletePod.title,
            promise: () => deleteMutation.mutateAsync(pendingDeletePod.id),
            successDescription: "Deleted",
          })
        },
      }
    : null

  const bulkConfirm: ConfirmConfig | null = pendingCloneBulkAction
    ? {
        title: BULK_CLONE_DIALOG_CONFIG[pendingCloneBulkAction.action].title,
        description: BULK_CLONE_DIALOG_CONFIG[
          pendingCloneBulkAction.action
        ].description(pendingCloneBulkAction.pod),
        actionLabel:
          POD_CLONE_ACTION_CONFIG[pendingCloneBulkAction.action].label,
        icon: POD_CLONE_ACTION_CONFIG[pendingCloneBulkAction.action].icon,
        variant:
          BULK_CLONE_DIALOG_CONFIG[pendingCloneBulkAction.action].variant,
        onConfirm: () => {
          const action = pendingCloneBulkAction.action
          const pod = pendingCloneBulkAction.pod
          const actionConfig = POD_CLONE_ACTION_CONFIG[action]

          showMutationToast({
            title: actionConfig.pendingLabel,
            items: [
              {
                id: "bulk",
                name: pod.title,
                retry: async () => {
                  const result = await bulkCloneActionMutation.mutateAsync({
                    pod,
                    action,
                  })
                  if (result.failed.length === 0) return
                  if (result.succeeded.length === 0) {
                    throw new Error("All clones failed")
                  }
                  throw new Error(
                    `${result.failed.length} of ${result.succeeded.length + result.failed.length} clones failed`
                  )
                },
              },
            ],
            runMutation: async () => {
              try {
                const result = await bulkCloneActionMutation.mutateAsync({
                  pod,
                  action,
                })
                if (
                  result.succeeded.length === 0 &&
                  result.failed.length === 0
                ) {
                  return { succeeded: ["bulk"], failed: [] }
                }
                if (result.failed.length === 0) {
                  return { succeeded: ["bulk"], failed: [] }
                }
                if (result.succeeded.length === 0) {
                  return {
                    succeeded: [],
                    failed: [{ id: "bulk", error: "All clones failed" }],
                  }
                }
                return {
                  succeeded: ["bulk"],
                  failed: [
                    {
                      id: "bulk",
                      error: `${result.failed.length} of ${result.succeeded.length + result.failed.length} clones failed`,
                    },
                  ],
                }
              } catch (error) {
                return {
                  succeeded: [],
                  failed: [
                    {
                      id: "bulk",
                      error:
                        error instanceof Error
                          ? error.message
                          : "Failed to apply bulk clone action",
                    },
                  ],
                }
              }
            },
          })
        },
      }
    : null

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
        />
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          config={deleteConfirm}
          onClose={() => setPendingDeletePod(null)}
        />
      )}
      {bulkConfirm && (
        <ConfirmDialog
          config={bulkConfirm}
          onClose={() => setPendingCloneBulkAction(null)}
        />
      )}
      <ManagerCloneDialog
        pod={pendingManagerClonePod}
        open={pendingManagerClonePod !== null}
        onOpenChange={(open) => {
          if (!open) setPendingManagerClonePod(null)
        }}
        pendingPrincipalIdsByPodId={pendingPrincipalIdsByPodId}
        onConfirm={(pod, principals) => handleManagerClone(pod, principals)}
      />
    </div>
  )
}
