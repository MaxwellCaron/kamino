import type { ClonedPod, Pod, PodProgress } from "@/lib/pods/pod-types"
import {
  catalogCloneSummariesQueryOptions,
  clonedPodQueryOptions,
  podProgressQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/lib/pods/clone-pod-api"
import {
  podCatalogEntryQueryOptions,
  publishedPodClonesQueryOptions,
} from "@/lib/pods/publish-pod-api"
import { useCallback, useState } from "react"
import { ClonePodDialog } from "@/components/pods/clone/clone-pod-dialog"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { PodCloneCard } from "@/components/pods/pod-clone-card"
import { PodHeader } from "@/components/pods/pod-header"
import { PodTasks } from "@/components/pods/pod-tasks"
import { useQueryClient } from "@tanstack/react-query"

type CloneDialogMode = "clone" | "reclone"

export function PodPage({
  pod,
  clonedPod,
  progress,
  username,
}: {
  pod: Pod
  clonedPod?: ClonedPod | null
  progress: PodProgress
  username: string
}) {
  const queryClient = useQueryClient()
  const [cloneDialogMode, setCloneDialogMode] =
    useState<CloneDialogMode | null>(null)
  const isPreview = clonedPod == null
  const setClonedPod = useCallback(
    (next: ClonedPod | null) => {
      queryClient.setQueryData(clonedPodQueryOptions(pod.slug).queryKey, next)
      if (next == null) {
        queryClient.invalidateQueries({
          queryKey: podCatalogEntryQueryOptions(pod.slug).queryKey,
        })
      }
    },
    [pod.slug, queryClient]
  )
  const setProgress = useCallback(
    (next: PodProgress) => {
      queryClient.setQueryData(podProgressQueryOptions(pod.slug).queryKey, next)
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
    [pod.id, pod.slug, queryClient]
  )

  return (
    <InventoryDialogsProvider>
      <>
        <div className="@container/main flex flex-1 flex-col">
          <PodHeader
            pod={pod}
            questionSummary={progress.question_summary}
            showClone={isPreview}
            onClone={() => setCloneDialogMode("clone")}
          />

          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
            {clonedPod && (
              <PodCloneCard
                pod={pod}
                clonedPod={clonedPod}
                onReclone={() => setCloneDialogMode("reclone")}
                onClonedPodChange={setClonedPod}
              />
            )}
            {pod.tasks.length > 0 && (
              <PodTasks
                tasks={pod.tasks}
                clonedPodId={clonedPod?.id}
                taskStates={progress.task_states}
                questionAnswers={progress.question_answers}
                questionsDisabled={isPreview}
                onAnswered={setProgress}
              />
            )}
          </div>
        </div>

        {cloneDialogMode ? (
          <ClonePodDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) setCloneDialogMode(null)
            }}
            pod={pod}
            username={username}
            clonedPodId={
              cloneDialogMode === "reclone" ? clonedPod?.id : undefined
            }
            onCloned={setClonedPod}
          />
        ) : null}
      </>
    </InventoryDialogsProvider>
  )
}
