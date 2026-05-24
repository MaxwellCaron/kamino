import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { PublishPodGeneralSection } from "./publish-pod-personalize-general"
import type { PublishPodFormApi } from "./publish-pod-form"

const frameworks = [
  "Next.js",
  "SvelteKit",
  "Nuxt.js",
  "Remix",
  "Astro",
] as const

type PublishPodPersonalizeStepProps = {
  form: PublishPodFormApi
}

export function PublishPodPersonalizeStep({
  form,
}: PublishPodPersonalizeStepProps) {
  return (
    <PublishPodStepLayout form={form}>
      <PublishPodGeneralSection
        creatorOptions={frameworks}
        folderOptions={frameworks}
        form={form}
      />
    </PublishPodStepLayout>
  )
}
