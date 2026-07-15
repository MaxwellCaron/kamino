import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { PublishedPodCatalogEntry, PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import {
  deletePublishedPod,
  deletePublishedPodClone,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  setPublishedPodStatus,
} from "@/features/pods/api/publish-pod-api"

type UsePublishedPodsPageMutationsOptions = {
  onDeleteSettled: () => void
}

export function usePublishedPodsPageMutations({
  onDeleteSettled,
}: UsePublishedPodsPageMutationsOptions) {
  const queryClient = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: setPublishedPodStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData<Array<PublishedPodCatalogEntry>>(
        publishedPodsQueryOptions.queryKey,
        (current) =>
          current?.map((pod) => (pod.id === updated.id ? updated : pod))
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
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: publishedPodsQueryOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        }),
      ]),
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
      onDeleteSettled()
    },
    onError: () => {
      onDeleteSettled()
    },
  })

  const deleteCloneMutation = useMutation({
    mutationFn: deletePublishedPodClone,
    onSuccess: (_, { podId, clonedPodId }) => {
      queryClient.setQueryData(
        publishedPodClonesQueryOptions(podId).queryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.filter((clone) => clone.id !== clonedPodId) ?? []
      )
      void queryClient.invalidateQueries({
        queryKey: publishedPodsQueryOptions.queryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
    },
  })

  return {
    statusMutation,
    deleteMutation,
    deleteCloneMutation,
  }
}
