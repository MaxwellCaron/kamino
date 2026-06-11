import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ClonePodDialog } from "./clone/clone-pod-dialog"
import { PodTasks } from "./pod-tasks"
import { PodHeader } from "./pod-header"
import { PodVms } from "./pod-vms"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"

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
  const [localClonedPodState, setLocalClonedPodState] = useState<{
    podId: string
    clonedPod: ClonedPod | null
  } | null>(null)
  const localClonedPod =
    localClonedPodState?.podId === pod.id
      ? localClonedPodState.clonedPod
      : (clonedPod ?? null)

  const isPreview = localClonedPod == null
  const setClonedPod = useCallback(
    (next: ClonedPod | null) => {
      setLocalClonedPodState({ podId: pod.id, clonedPod: next })
      queryClient.setQueryData(clonedPodQueryOptions(pod.slug).queryKey, next)
      if (next == null) {
        queryClient.invalidateQueries({
          queryKey: podCatalogEntryQueryOptions(pod.slug).queryKey,
        })
      }
    },
    [pod.id, pod.slug, queryClient]
  )

  return (
    <InventoryDialogsProvider>
      <>
        <div className="@container/main flex flex-1 flex-col">
          <PodHeader
            pod={pod}
            clonedPod={localClonedPod}
            onClone={() => setCloneDialogMode("clone")}
            onReclone={() => setCloneDialogMode("reclone")}
            onClonedPodChange={setClonedPod}
          />

          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
            {localClonedPod && <PodVms vms={localClonedPod.vms} />}
            <PodTasks
              tasks={pod.tasks ?? []}
              clonedPodId={localClonedPod?.id}
              taskStates={localClonedPod?.task_states ?? null}
              questionAnswers={localClonedPod?.question_answers ?? null}
              questionsDisabled={isPreview}
              onClonedPodChange={setClonedPod}
            />
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
              cloneDialogMode === "reclone" ? localClonedPod?.id : undefined
            }
            onCloned={setClonedPod}
          />
        ) : null}
      </>
    </InventoryDialogsProvider>
  )
}
