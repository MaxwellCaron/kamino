import type { ClonedPod, Pod } from "@/lib/pods/pod-types"
import { useCallback, useState } from "react"
import { ClonePodDialog } from "@/components/pods/clone/clone-pod-dialog"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { PodCloneCard } from "@/components/pods/pod-clone-card"
import { PodHeader } from "@/components/pods/pod-header"
import { PodTasks } from "@/components/pods/pod-tasks"
import { clonedPodQueryOptions } from "@/lib/pods/clone-pod-api"
import { podCatalogEntryQueryOptions } from "@/lib/pods/publish-pod-api"
import { useQueryClient } from "@tanstack/react-query"

type CloneDialogMode = "clone" | "reclone"

export function PodPage({
  pod,
  clonedPod,
  username,
}: {
  pod: Pod
  clonedPod?: ClonedPod | null
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

  return (
    <InventoryDialogsProvider>
      <>
        <div className="@container/main flex flex-1 flex-col">
          <PodHeader
            pod={pod}
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
                taskStates={clonedPod?.task_states ?? null}
                questionAnswers={clonedPod?.question_answers ?? null}
                questionsDisabled={isPreview}
                onClonedPodChange={setClonedPod}
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
