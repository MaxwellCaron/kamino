import { useEffect, useState } from "react"
import { ClonePodDialog } from "./clone/clone-pod-dialog"
import { PodTasks } from "./pod-tasks"
import { PodHeader } from "./pod-header"
import { PodVms } from "./pod-vms"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { uuid } from "@workspace/ui/lib/utils"

function createClonedPodFromPod(pod: Pod): ClonedPod {
  return {
    id: uuid(),
    pod_id: pod.id,
    cloned_at: new Date().toISOString(),
    status: "running",
    vms: [],
    task_summary: {
      total: pod.tasks?.length ?? 0,
      completed: 0,
      progress: 0,
    },
    task_states: [],
    question_answers: [],
  }
}

export function PodPage({
  pod,
  clonedPod,
  username,
}: {
  pod: Pod
  clonedPod?: ClonedPod | null
  username: string
}) {
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [localClonedPod, setLocalClonedPod] = useState<ClonedPod | null>(
    clonedPod ?? null
  )

  useEffect(() => {
    setCloneDialogOpen(false)
    setLocalClonedPod(clonedPod ?? null)
  }, [clonedPod, pod.id])

  const isPreview = localClonedPod == null

  return (
    <InventoryDialogsProvider>
      <>
        <div className="@container/main flex flex-1 flex-col">
          <PodHeader
            pod={pod}
            clonedPod={localClonedPod}
            onClone={() => setCloneDialogOpen(true)}
          />

          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
            {localClonedPod && (
              <PodVms vms={localClonedPod.vms} vmsVisible={pod.vms_visible} />
            )}
            <PodTasks
              tasks={pod.tasks ?? []}
              taskStates={localClonedPod?.task_states ?? null}
              questionAnswers={localClonedPod?.question_answers ?? null}
              questionsDisabled={isPreview}
            />
          </div>
        </div>

        <ClonePodDialog
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
          pod={pod}
          username={username}
          onCloned={() => {
            setLocalClonedPod(clonedPod ?? createClonedPodFromPod(pod))
          }}
        />
      </>
    </InventoryDialogsProvider>
  )
}
