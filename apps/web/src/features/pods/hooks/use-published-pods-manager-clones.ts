import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import type { PendingCloneRow } from "@/features/pods/types/published-pods-types"
import type { PublishedPodCatalogEntry, PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import { uuid } from "@/features/shared/utils/uuid"
import {
  createPublishedPodClone,
  podCatalogQueryOptions,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"

export function usePublishedPodsManagerClones() {
  const queryClient = useQueryClient()
  const [pendingCloneRowsByPodId, setPendingCloneRowsByPodId] = useState<
    Record<string, Array<PendingCloneRow>>
  >({})
  const [pendingManagerClonePod, setPendingManagerClonePod] =
    useState<PublishedPodCatalogEntry | null>(null)

  const handleDismissCloneRow = useCallback(
    (podId: string, progressId: string) => {
      setPendingCloneRowsByPodId((prev) => {
        const rows = prev[podId] ?? []
        const next = rows.filter((r) => r.progressId !== progressId)
        if (next.length === 0) {
          const { [podId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [podId]: next }
      })
    },
    []
  )

  const handleManagerClone = useCallback(
    async (pod: PublishedPodCatalogEntry, principals: Array<PrincipalOption>) => {
      const rows: Array<PendingCloneRow> = principals.map((p) => ({
        progressId: uuid(),
        principal: p,
        state: "queued" as const,
      }))

      setPendingCloneRowsByPodId((prev) => ({
        ...prev,
        [pod.id]: [...(prev[pod.id] ?? []), ...rows],
      }))

      setPendingCloneRowsByPodId((prev) => ({
        ...prev,
        [pod.id]: (prev[pod.id] ?? []).map((r) =>
          rows.some((nr) => nr.progressId === r.progressId)
            ? { ...r, state: "running" as const }
            : r
        ),
      }))

      const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

      const results = await Promise.all(
        rows.map(async (row) => {
          try {
            const summary = await createPublishedPodClone({
              podId: pod.id,
              principalId: row.principal.id,
              progressId: row.progressId,
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
            setPendingCloneRowsByPodId((prev) => ({
              ...prev,
              [pod.id]: (prev[pod.id] ?? []).filter(
                (r) => r.progressId !== row.progressId
              ),
            }))
            return { ok: true as const }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Clone failed."
            setPendingCloneRowsByPodId((prev) => ({
              ...prev,
              [pod.id]: (prev[pod.id] ?? []).map((r) =>
                r.progressId === row.progressId
                  ? { ...r, state: "error" as const, message }
                  : r
              ),
            }))
            return { ok: false as const }
          }
        })
      )

      const succeeded = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok).length

      if (succeeded > 0) {
        void queryClient.invalidateQueries({
          queryKey: publishedPodsQueryOptions.queryKey,
        })
        void queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        })
      }

      if (failed === 0) {
        toast.success(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}.`
        )
      } else if (succeeded === 0) {
        toast.error("Failed to clone pod for the selected principals.")
      } else {
        toast.warning(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}; ${failed} failed.`
        )
      }
    },
    [queryClient]
  )

  return {
    pendingCloneRowsByPodId,
    pendingManagerClonePod,
    setPendingManagerClonePod,
    handleDismissCloneRow,
    handleManagerClone,
  }
}
