import { ClonedPodTasks } from "./cloned-pod-tasks"
import type { ClonedPod } from "@/features/pods/types/pod-types"
import { GrainientBackground } from "@/components/grainient-background"

export function ClonedPodPage({ pod }: { pod: ClonedPod }) {
  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <div className="relative overflow-hidden border-b bg-muted/30">
          <GrainientBackground className="opacity-40" />
          <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
              <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
                {pod.title}
              </h1>
              <p className="text-lg text-balance text-muted-foreground sm:text-xl">
                {pod.description}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
          <ClonedPodTasks tasks={pod.tasks?.items ?? []} />
        </div>
      </div>
    </>
  )
}
