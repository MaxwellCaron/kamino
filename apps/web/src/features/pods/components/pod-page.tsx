import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ClonePodDialog } from "./clone/clone-pod-dialog"
import { PodTasks } from "./pod-tasks"
import { PodHeader } from "./pod-header"
import { PodVms } from "./pod-vms"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"

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
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [localClonedPod, setLocalClonedPod] = useState<ClonedPod | null>(
    clonedPod ?? null
  )

  useEffect(() => {
    setCloneDialogOpen(false)
  }, [pod.id])

  useEffect(() => {
    setLocalClonedPod(clonedPod ?? null)
  }, [clonedPod])

  const isPreview = localClonedPod == null
  const setClonedPod = useCallback(
    (next: ClonedPod | null) => {
      setLocalClonedPod(next)
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
            clonedPod={localClonedPod}
            onClone={() => setCloneDialogOpen(true)}
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

        <ClonePodDialog
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
          pod={pod}
          username={username}
          onCloned={setClonedPod}
        />
      </>
    </InventoryDialogsProvider>
  )
}
