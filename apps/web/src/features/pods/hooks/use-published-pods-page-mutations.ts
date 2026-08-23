import { useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  PodStatus,
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import {
  deletePublishedPod,
  deletePublishedPodClone,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  setPublishedPodStatus,
} from "@/features/pods/api/publish-pod-api"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"

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

  const showStatusToast = useCallback(
    (pod: PublishedPodCatalogEntry, status: PodStatus) => {
      showSingleMutationToast({
        title: status === "listed" ? "Listing" : "Unlisting",
        name: pod.title,
        promise: () => statusMutation.mutateAsync({ id: pod.id, status }),
        successDescription: status === "listed" ? "Listed" : "Unlisted",
      })
    },
    [statusMutation]
  )

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
    showStatusToast,
    deleteMutation,
    deleteCloneMutation,
  }
}
