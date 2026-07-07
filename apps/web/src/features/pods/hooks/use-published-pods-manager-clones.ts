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
import { showMutationToast } from "@/components/feedback/mutation-progress-toast"

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

      const cloneOne = async (principal: PrincipalOption) => {
        const summary = await createPublishedPodClone({
          podId: pod.id,
          principalId: principal.id,
          progressId: uuid(),
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

      showMutationToast({
        title: `Cloning "${pod.title}"`,
        items: principals.map((p) => ({
          id: p.id,
          name: p.label,
          successDescription: "Cloned",
          retry: () => cloneOne(p),
        })),
        runMutation: async (report) => {
          const succeeded: Array<string> = []
          const failed: Array<{ id: string; error: string }> = []

          await Promise.all(
            principals.map(async (p) => {
              try {
                await cloneOne(p)
                succeeded.push(p.id)
                report({ id: p.id, status: "done" })
              } catch (err) {
                const error = err instanceof Error ? err.message : "Clone failed."
                failed.push({ id: p.id, error })
                report({ id: p.id, status: "error", error })
              } finally {
                removePendingPrincipal(pod.id, p.id)
              }
            })
          )

          if (succeeded.length > 0) {
            void queryClient.invalidateQueries({
              queryKey: publishedPodsQueryOptions.queryKey,
            })
            void queryClient.invalidateQueries({
              queryKey: podCatalogQueryOptions.queryKey,
            })
          }

          return { succeeded, failed }
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
