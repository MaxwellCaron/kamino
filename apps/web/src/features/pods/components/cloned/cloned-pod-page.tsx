import { ClonedPodTasks } from "./cloned-pod-tasks"
import { ClonedPodHeader } from "./cloned-pod-header"
import { ClonedPodVms } from "./cloned-pod-vms"
import type { ClonedPod } from "@/features/pods/types/pod-types"

export function ClonedPodPage({ pod }: { pod: ClonedPod }) {
  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <ClonedPodHeader pod={pod} />

        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 md:py-6 lg:px-6">
          <ClonedPodVms vms={pod.vms} vmsVisible={pod.vmsVisible} />
          <ClonedPodTasks tasks={pod.tasks?.items ?? []} />
        </div>
      </div>
    </>
  )
}
