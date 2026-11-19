import {
  answerClonedPodQuestion,
  catalogCloneSummariesQueryOptions,
  podProgressQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/lib/pods/clone-pod-api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Pod } from "@/lib/pods/pod-types"
import { publishedPodClonesQueryOptions } from "@/lib/pods/publish-pod-api"

export function useAnswerPodQuestion(pod: Pick<Pod, "id" | "slug">) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: answerClonedPodQuestion,
    onSuccess: (progress) => {
      queryClient.setQueryData(
        podProgressQueryOptions(pod.slug).queryKey,
        progress
      )
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: catalogCloneSummariesQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: publishedPodClonesQueryOptions(pod.id).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: podQuestionActivityQueryOptions().queryKey,
        }),
      ])
    },
  })
}
