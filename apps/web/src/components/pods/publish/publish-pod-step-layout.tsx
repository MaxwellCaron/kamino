import type { ClonedPod } from "@/lib/pods/pod-types"
import { PodCloneCard } from "@/components/pods/pod-clone-card"
import { PodHeader } from "@/components/pods/pod-header"
import type { PublishPodFormApi } from "@/hooks/pods/use-publish-pod-form"
import type { ReactNode } from "react"
import { toPodDraft } from "@/lib/pods/publish/publish-pod-form"

type PublishPodStepLayoutProps = {
  actionsDisabled?: boolean
  children: ReactNode
  clonedPod?: ClonedPod | null
  form: PublishPodFormApi
}

export function PublishPodStepLayout({
  actionsDisabled = false,
  children,
  clonedPod = null,
  form,
}: PublishPodStepLayoutProps) {
  return (
    <div className="flex flex-col">
      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <PodHeader pod={toPodDraft(values)} showClone={!clonedPod} />
        )}
      </form.Subscribe>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        {clonedPod && (
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <PodCloneCard
                pod={toPodDraft(values)}
                clonedPod={clonedPod}
                actionsDisabled={actionsDisabled}
              />
            )}
          </form.Subscribe>
        )}
        {children}
      </div>
    </div>
  )
}
