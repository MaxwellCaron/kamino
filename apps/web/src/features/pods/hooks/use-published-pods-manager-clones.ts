import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { MutationItemUpdate } from "@/components/feedback/mutation-progress-toast"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishedPodCatalogEntry, PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import {
  runMutationUnits,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import { fetchClonePodProgressBatch } from "@/features/pods/api/clone-pod-api"
import {
  createPublishedPodClone,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import { DEFAULT_CLONE_TASKS } from "@/features/pods/types/clone-status"
import { MANAGER_POD_WORKFLOW_CONCURRENCY } from "@/features/pods/utils/pod-clone-actions"
import { uuid } from "@/features/shared/utils/uuid"

function startBatchProgressPoll(
  progressBatchId: string,
  childToPrincipal: Map<string, string>,
  report: (update: MutationItemUpdate) => void
) {
  let stopped = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const scheduleNext = () => {
    if (stopped) {
      return
    }
    timeoutId = setTimeout(() => {
      void tick()
    }, 750)
  }

  const tick = async () => {
    if (stopped) {
      return
    }
    try {
      const batch = await fetchClonePodProgressBatch(progressBatchId)
      for (const snapshot of batch.items) {
        if (snapshot.state !== "running") {
          continue
        }
        const principalId = childToPrincipal.get(snapshot.id)
        if (!principalId) {
          continue
        }
        const task = DEFAULT_CLONE_TASKS.find((t) => t.id === snapshot.step_id)
        if (!task) {
          continue
        }
        report({
          id: principalId,
          status: "progress",
          description: `Step ${task.id}/${DEFAULT_CLONE_TASKS.length} — ${task.name}`,
        })
      }
    } catch {
      // 404 until the backend writes the first snapshot; ignore.
    }
    scheduleNext()
  }

  void tick()

  return () => {
    stopped = true
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export function usePublishedPodsManagerClones() {
  const queryClient = useQueryClient()
  const [pendingPrincipalIdsByPodId, setPendingPrincipalIdsByPodId] = useState<
    Record<string, Array<string>>
  >({})
  const [pendingManagerClonePod, setPendingManagerClonePod] =
    useState<PublishedPodCatalogEntry | null>(null)

  const removePendingPrincipal = useCallback((podId: string, principalId: string) => {
    setPendingPrincipalIdsByPodId((prev) => {
      const next = (prev[podId] ?? []).filter((id) => id !== principalId)
      if (next.length === 0) {
        const { [podId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [podId]: next }
    })
  }, [])

  const handleManagerClone = useCallback(
    (pod: PublishedPodCatalogEntry, principals: Array<PrincipalOption>) => {
      const principalIds = principals.map((p) => p.id)

      setPendingPrincipalIdsByPodId((prev) => ({
        ...prev,
        [pod.id]: [...(prev[pod.id] ?? []), ...principalIds],
      }))

      const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey
      const progressBatchId = uuid()
      const childToPrincipal = new Map<string, string>()

      const cloneOne = async (
        principal: PrincipalOption,
        progressId: string,
        batchId: string
      ) => {
        const summary = await createPublishedPodClone({
          podId: pod.id,
          principalId: principal.id,
          progressId,
          progressBatchId: batchId,
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
      }

      const innerUnits = principals.map((principal) => ({
        items: [
          {
            id: principal.id,
            name: principal.label,
            successDescription: "Cloned",
          },
        ],
        run: async () => {
          const progressId = uuid()
          childToPrincipal.set(progressId, principal.id)
          try {
            await cloneOne(principal, progressId, progressBatchId)
          } finally {
            removePendingPrincipal(pod.id, principal.id)
          }
        },
      }))

      showUnitMutationToast({
        title: `Cloning "${pod.title}"`,
        units: [
          {
            items: principals.map((principal) => ({
              id: principal.id,
              name: principal.label,
              successDescription: "Cloned",
              retry: async () => {
                const retryProgressId = uuid()
                const retryBatchId = uuid()
                await cloneOne(principal, retryProgressId, retryBatchId)
              },
            })),
            run: async (report) => {
              const stopPoll = startBatchProgressPoll(
                progressBatchId,
                childToPrincipal,
                report
              )
              try {
                const result = await runMutationUnits(
                  innerUnits,
                  report,
                  MANAGER_POD_WORKFLOW_CONCURRENCY
                )
                return { failed: result.failed }
              } finally {
                stopPoll()
              }
            },
          },
        ],
        onSettled: (result) => {
          if (result.succeeded.length > 0) {
            void queryClient.invalidateQueries({
              queryKey: publishedPodsQueryOptions.queryKey,
            })
            void queryClient.invalidateQueries({
              queryKey: podCatalogQueryOptions.queryKey,
            })
          }
        },
      })
    },
    [queryClient, removePendingPrincipal]
  )

  return {
    pendingPrincipalIdsByPodId,
    pendingManagerClonePod,
    setPendingManagerClonePod,
    handleManagerClone,
  }
}
