import { toPodDraft } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { ReactNode } from "react"
import { PodHeader } from "@/features/pods/components/pod-header"

type PublishPodStepLayoutProps = {
  children: ReactNode
  form: PublishPodFormApi
}

export function PublishPodStepLayout({
  children,
  form,
}: PublishPodStepLayoutProps) {
  return (
    <div className="flex flex-col">
      <form.Subscribe selector={(state) => state.values}>
        {(values) => <PodHeader pod={toPodDraft(values)} clonedPod={null} />}
      </form.Subscribe>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        {children}
      </div>
    </div>
  )
}
