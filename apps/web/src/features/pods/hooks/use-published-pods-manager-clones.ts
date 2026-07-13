import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { PublishedPodCatalogEntry, PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import { uuid } from "@/features/shared/utils/uuid"
import {
  createPublishedPodClone,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import { fetchClonePodProgress } from "@/features/pods/api/clone-pod-api"
import { DEFAULT_CLONE_TASKS } from "@/features/pods/types/clone-status"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

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

      const cloneOne = async (
        principal: PrincipalOption,
        progressId: string
      ) => {
        const summary = await createPublishedPodClone({
          podId: pod.id,
          principalId: principal.id,
          progressId,
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

      showUnitMutationToast({
        title: `Cloning "${pod.title}"`,
        units: principals.map((principal) => ({
          items: [
            {
              id: principal.id,
              name: principal.label,
              successDescription: "Cloned",
            },
          ],
          run: async (report) => {
            const progressId = uuid()
            const interval = setInterval(() => {
              void fetchClonePodProgress(progressId)
                .then((snapshot) => {
                  if (snapshot.state !== "running") return
                  const task = DEFAULT_CLONE_TASKS.find(
                    (t) => t.id === snapshot.step_id
                  )
                  if (!task) return
                  report({
                    id: principal.id,
                    status: "progress",
                    description: `Step ${task.id}/${DEFAULT_CLONE_TASKS.length} — ${task.name}`,
                  })
                })
                .catch(() => {
                  // 404 until the backend writes the first snapshot; ignore.
                })
            }, 750)
            try {
              await cloneOne(principal, progressId)
            } finally {
              clearInterval(interval)
              removePendingPrincipal(pod.id, principal.id)
            }
          },
        })),
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
