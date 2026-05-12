import { ItemGroup } from "@workspace/ui/components/item"
import { clonedPods } from "../../types/test-data"
import { ClonedPodCard } from "./cloned-pod-card"
import { GrainientBackground } from "@/components/grainient-background"

export function ClonedPodsPage() {
  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <div className="relative overflow-hidden border-b bg-muted/30">
          <GrainientBackground className="opacity-40" />
          <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
              <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
                Cloned Pods
              </h1>
              <p className="text-lg text-balance text-muted-foreground sm:text-xl">
                Curated virtual machine environments meant for hands-on
                learning. Browse through a selection of ready-to-use pods to get
                started.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
          <div className="flex w-full flex-col gap-6">
            <ItemGroup className="space-y-4">
              {clonedPods.map((pod) => (
                <ClonedPodCard key={pod.id} pod={pod} />
              ))}
            </ItemGroup>
          </div>
        </div>
      </div>
    </>
  )
}
