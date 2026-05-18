import { useEffect, useState } from "react"
import { ClonePodDialog } from "../clone/clone-pod-dialog"
import { ClonedPodTasks } from "./cloned-pod-tasks"
import { ClonedPodHeader } from "./cloned-pod-header"
import { ClonedPodVms } from "./cloned-pod-vms"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"

function createClonedPodFromPod(pod: Pod): ClonedPod {
  return {
    ...pod,
    cloned_at: new Date().toISOString(),
    status: "running",
    vms: [],
  }
}

export function ClonedPodPage({
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

  const displayedPod = localClonedPod ?? pod
  const isPreview = localClonedPod == null

  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <ClonedPodHeader
          pod={displayedPod}
          isPreview={isPreview}
          onClone={() => setCloneDialogOpen(true)}
        />

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
          {localClonedPod && (
            <ClonedPodVms
              vms={localClonedPod.vms}
              vmsVisible={localClonedPod.vmsVisible}
            />
          )}
          <ClonedPodTasks
            tasks={displayedPod.tasks?.items ?? []}
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
  )
}
