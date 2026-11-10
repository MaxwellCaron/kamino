import type { ClonedPod, Pod } from "@/lib/pods/pod-types"
import {
  clonePod,
  clonePodProgressQueryOptions,
  clonedPodQueryOptions,
  reclonePod,
} from "@/lib/pods/clone-pod-api"
import {
  formatTime,
  getCloneProcessState,
} from "@/lib/pods/clone-pod-dialog"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { podCatalogQueryOptions } from "@/lib/pods/publish-pod-api"
import { uuid } from "@/lib/uuid"

export function useCloneProcess({
  open,
  pod,
  clonedPodId,
  onCloned,
}: {
  open: boolean
  pod: Pod | null
  clonedPodId?: string
  onCloned?: (clone: ClonedPod) => void
}) {
  const queryClient = useQueryClient()
  const [progressId, setProgressId] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const cloneMutation = useMutation({
    mutationFn: (params: { podSlug: string; progressId: string }) => {
      if (clonedPodId) {
        return reclonePod({ clonedPodId, progressId: params.progressId })
      }

      return clonePod(params)
    },
    onSuccess: async (clone) => {
      onCloned?.(clone)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: clonedPodQueryOptions(pod?.slug).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        }),
      ])
    },
  })
  const { data: progressData } = useQuery(
    clonePodProgressQueryOptions(
      progressId,
      open && progressId != null && cloneMutation.isPending
    )
  )
  const progressState = progressData?.state
  const currentStep =
    progressData?.step_id ??
    (cloneMutation.isPending || cloneMutation.isSuccess || cloneMutation.isError
      ? 1
      : 0)
  const { isCloning, isError, isFinished, tasks, progress, colors } =
    getCloneProcessState({
      currentStep,
      mutationIsError: cloneMutation.isError,
      mutationIsPending: cloneMutation.isPending,
      mutationIsSuccess: cloneMutation.isSuccess,
      progressState,
    })

  useEffect(() => {
    if (!isCloning || isFinished || isError) return
    const interval = setInterval(() => setElapsedTime((p) => p + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isError, isFinished])

  return {
    isCloning,
    isFinished,
    isError,
    tasks,
    progress,
    colors,
    elapsedTime: formatTime(elapsedTime),
    error:
      progressData?.state === "error"
        ? progressData.message
        : cloneMutation.error?.message,
    startCloning: () => {
      if (!pod) return
      const nextProgressId = uuid()
      setElapsedTime(0)
      setProgressId(nextProgressId)
      cloneMutation.mutate({ podSlug: pod.slug, progressId: nextProgressId })
    },
  }
}
