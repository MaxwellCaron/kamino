import { useMemo } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import type { PendingCloneBulkAction } from "@/features/pods/types/published-pods-types"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import {
  podCatalogQueryOptions,
  powerPublishedPodClone,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  reclonePublishedPodClone,
} from "@/features/pods/api/publish-pod-api"
import {
  MANAGER_POD_WORKFLOW_CONCURRENCY,
  POD_CLONE_ACTION_CONFIG,
  podPowerIncompleteMessage,
} from "@/features/pods/utils/pod-clone-actions"
import { formatToastError } from "@/features/shared/utils/format"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

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

type DeleteCloneMutation = UseMutationResult<
  void,
  Error,
  { podId: string; clonedPodId: string }
>

type UsePublishedPodsBulkConfirmOptions = {
  pendingCloneBulkAction: PendingCloneBulkAction
  deleteCloneMutation: DeleteCloneMutation
}

export function usePublishedPodsBulkConfirm({
  pendingCloneBulkAction,
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

        const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

        if (action === "delete") {
          if (clones.length === 0) {
            toast.info("No clones to delete.")
            void queryClient.invalidateQueries({ queryKey: clonesQueryKey })
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
            concurrency: MANAGER_POD_WORKFLOW_CONCURRENCY,
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

        if (clones.length === 0) {
          toast.info("No clones to update.")
          return
        }

        const upsertClone = (updated: PublishedPodCloneSummary) => {
          queryClient.setQueryData(
            clonesQueryKey,
            (current: Array<PublishedPodCloneSummary> | undefined) =>
              current?.map((c) => (c.id === updated.id ? updated : c)) ?? []
          )
        }

        const invalidateAfterCloneActions = () => {
          void queryClient.invalidateQueries({ queryKey: clonesQueryKey })
          void queryClient.invalidateQueries({
            queryKey: publishedPodsQueryOptions.queryKey,
          })
        }

        if (action === "start" || action === "shutdown") {
          const powerAction = action
          showUnitMutationToast({
            title: actionConfig.pendingLabel,
            units: clones.map((clone) => ({
              items: [
                {
                  id: clone.id,
                  name: clone.owner.label,
                  successDescription:
                    powerAction === "start" ? "Started" : "Shut down",
                },
              ],
              run: async () => {
                const updated = await powerPublishedPodClone({
                  podId: pod.id,
                  clonedPodId: clone.id,
                  action: powerAction,
                })
                upsertClone(updated)
                if (updated.power_result?.status !== "succeeded") {
                  throw new Error(podPowerIncompleteMessage(powerAction))
                }
              },
            })),
            onSettled: invalidateAfterCloneActions,
          })
          return
        }

        showUnitMutationToast({
          title: actionConfig.pendingLabel,
          concurrency: MANAGER_POD_WORKFLOW_CONCURRENCY,
          units: clones.map((clone) => ({
            items: [
              {
                id: clone.id,
                name: clone.owner.label,
                successDescription: "Re-cloned",
              },
            ],
            run: async () => {
              const updated = await reclonePublishedPodClone({
                podId: pod.id,
                clonedPodId: clone.id,
              })
              upsertClone(updated)
            },
          })),
          onSettled: invalidateAfterCloneActions,
        })
      },
    }
  }, [deleteCloneMutation, pendingCloneBulkAction, queryClient])
}
