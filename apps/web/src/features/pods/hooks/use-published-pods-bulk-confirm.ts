import { useMemo } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import type { PendingCloneBulkAction } from "@/features/pods/types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { bulkActionPublishedPodClones } from "@/features/pods/api/publish-pod-api"
import {
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import {
  POD_CLONE_ACTION_CONFIG,
  podPowerIncompleteMessage,
} from "@/features/pods/utils/pod-clone-actions"
import { formatToastError } from "@/features/shared/utils/format"
import { showSingleMutationToast, showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

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

type BulkCloneActionMutation = UseMutationResult<
  Awaited<ReturnType<typeof bulkActionPublishedPodClones>>,
  Error,
  { pod: PublishedPodCatalogEntry; action: PodCloneAction }
>

type DeleteCloneMutation = UseMutationResult<
  void,
  Error,
  { podId: string; clonedPodId: string }
>

type UsePublishedPodsBulkConfirmOptions = {
  pendingCloneBulkAction: PendingCloneBulkAction
  bulkCloneActionMutation: BulkCloneActionMutation
  deleteCloneMutation: DeleteCloneMutation
}

export function usePublishedPodsBulkConfirm({
  pendingCloneBulkAction,
  bulkCloneActionMutation,
  deleteCloneMutation,
}: UsePublishedPodsBulkConfirmOptions): ConfirmConfig | null {
  const queryClient = useQueryClient()

  return useMemo(() => {
    if (!pendingCloneBulkAction) {
      return null
    }

    const { pod, action } = pendingCloneBulkAction
    const actionConfig = POD_CLONE_ACTION_CONFIG[action]

    return {
      title: BULK_CLONE_DIALOG_CONFIG[action].title,
      description: BULK_CLONE_DIALOG_CONFIG[action].description(pod),
      actionLabel: actionConfig.label,
      icon: actionConfig.icon,
      variant: BULK_CLONE_DIALOG_CONFIG[action].variant,
      onConfirm: async () => {
        if (action === "delete") {
          let clones
          try {
            clones = await queryClient.fetchQuery(
              publishedPodClonesQueryOptions(pod.id)
            )
          } catch (error) {
            toast.error(
              formatToastError(error, "Failed to load cloned instances")
            )
            return
          }

          if (clones.length === 0) {
            toast.info("No clones to delete.")
            void queryClient.invalidateQueries({
              queryKey: publishedPodClonesQueryOptions(pod.id).queryKey,
            })
            void queryClient.invalidateQueries({
              queryKey: publishedPodsQueryOptions.queryKey,
            })
            void queryClient.invalidateQueries({
              queryKey: podCatalogQueryOptions.queryKey,
            })
            return
          }

          showUnitMutationToast({
            title: `Deleting ${clones.length} clone${clones.length === 1 ? "" : "s"}`,
            concurrency: 1,
            units: clones.map((clone) => ({
              items: [
                {
                  id: clone.id,
                  name: clone.owner.label,
                  successDescription: "Deleted",
                  retry: async () => {
                    await deleteCloneMutation.mutateAsync({
                      podId: pod.id,
                      clonedPodId: clone.id,
                    })
                  },
                },
              ],
              run: async () => {
                await deleteCloneMutation.mutateAsync({
                  podId: pod.id,
                  clonedPodId: clone.id,
                })
              },
            })),
          })
          return
        }

        if (action === "start" || action === "shutdown") {
          if (pod.clone_count === 0) {
            toast.info("No clones to update.")
            return
          }

          showSingleMutationToast({
            title: actionConfig.pendingLabel,
            name: pod.title,
            promise: async () => {
              const result = await bulkCloneActionMutation.mutateAsync({
                pod,
                action,
              })
              void queryClient.invalidateQueries({
                queryKey: publishedPodClonesQueryOptions(pod.id).queryKey,
              })
              if (result.failed.length > 0) {
                throw new Error(podPowerIncompleteMessage(action))
              }
            },
          })
          return
        }

        showUnitMutationToast({
          title: actionConfig.pendingLabel,
          units: [
            {
              items: [
                {
                  id: "bulk",
                  name: pod.title,
                },
              ],
              run: async () => {
                const result = await bulkCloneActionMutation.mutateAsync({
                  pod,
                  action,
                })
                if (result.failed.length === 0) {
                  return
                }
                if (result.succeeded.length === 0) {
                  throw new Error("All clones failed")
                }
                throw new Error(
                  `${result.failed.length} of ${result.succeeded.length + result.failed.length} clones failed`
                )
              },
            },
          ],
        })
      },
    }
  }, [
    bulkCloneActionMutation,
    deleteCloneMutation,
    pendingCloneBulkAction,
    queryClient,
  ])
}
