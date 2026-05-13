import { useState } from "react"
import { ClonePodDialog } from "../clone-pod-dialog"
import { BrowsePodsCard } from "./browse-pods-card"
import type { Pod } from "@/features/pods/types/pod-types"
import { pods } from "@/features/pods/types/test-data"
import { GrainientBackground } from "@/components/grainient-background"

export function BrowsePodsPage({ username }: { username: string }) {
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null)

  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <div className="relative overflow-hidden border-b bg-muted/30">
          <GrainientBackground className="opacity-40" />
          <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
              <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
                Pods
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 xl:gap-12">
            {pods.map((pod) => (
              <BrowsePodsCard
                key={pod.id}
                pod={pod}
                onClone={(podToClone) => {
                  setSelectedPod(podToClone)
                  setCloneDialogOpen(true)
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <ClonePodDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        pod={selectedPod}
        username={username}
      />
    </>
  )
}
