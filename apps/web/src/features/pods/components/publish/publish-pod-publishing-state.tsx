import { IconBox, IconListDetails } from "@tabler/icons-react"
import type { PodSubmitProgressStep } from "@/components/submit-progress"
import {
  PodSubmitErrorState,
  PodSubmitLoadingState,
  PodSubmitProgressState,
  PodSubmitSuccessState,
} from "@/components/submit-progress"

export const PUBLISH_POD_STEP_IDS = [1, 2, 3, 4] as const
export const PUBLISH_POD_STEP_COUNT = PUBLISH_POD_STEP_IDS.length
export const PUBLISH_POD_STEP_INTERVAL_MS = 2_000
export const UPDATE_POD_INTERVAL_MS = 2_000

export type PublishPodStepId = (typeof PUBLISH_POD_STEP_IDS)[number]
export type PublishPodSubmitStatus =
  | "publishing"
  | "updating"
  | "success"
  | "error"

const PUBLISH_POD_STEPS = [
  {
    id: 1,
    title: "Fetching VMs",
    description: "Finding the source virtual machines selected for this Pod.",
  },
  {
    id: 2,
    title: "Creating Pod Folders",
    description: "Preparing the folder structure for the published Pod.",
  },
  {
    id: 3,
    title: "Cloning source VMs",
    description: "Copying source virtual machines into the publish workspace.",
  },
  {
    id: 4,
    title: "Converting VMs to templates",
    description: "Marking cloned virtual machines as reusable templates.",
  },
] satisfies [
  PodSubmitProgressStep<PublishPodStepId>,
  ...Array<PodSubmitProgressStep<PublishPodStepId>>,
]

function PublishingState({
  onPublishingComplete,
  publishingStepId,
}: {
  onPublishingComplete?: () => void
  publishingStepId?: PublishPodStepId
}) {
  return (
    <PodSubmitProgressState
      intervalMs={PUBLISH_POD_STEP_INTERVAL_MS}
      onComplete={onPublishingComplete}
      stepId={publishingStepId}
      steps={PUBLISH_POD_STEPS}
      title="Publishing"
    />
  )
}

function UpdatingState({
  onUpdatingComplete,
}: {
  onUpdatingComplete?: () => void
}) {
  return (
    <PodSubmitLoadingState
      description="Saving the latest changes to this Pod."
      intervalMs={UPDATE_POD_INTERVAL_MS}
      onComplete={onUpdatingComplete}
      title="Updating"
    />
  )
}

function SuccessState() {
  return (
    <PodSubmitSuccessState
      title="Published"
      description="Your Pod has been successfully published. View it in the catalog or go directly to its page."
      actions={[
        {
          icon: IconListDetails,
          label: "View Catalog",
          to: "/pods/published",
          variant: "secondary",
        },
        {
          icon: IconBox,
          label: "View Pod",
          to: "/pods/publish",
        },
      ]}
    />
  )
}

function ErrorState() {
  return (
    <PodSubmitErrorState
      title="Publishing Failed"
      description="Your Pod failed to publish. Please try again or contact support if the issue persists."
      actions={[
        {
          icon: IconListDetails,
          label: "View Catalog",
          to: "/pods/published",
          variant: "secondary",
        },
      ]}
    />
  )
}

export function PublishPodSubmitState({
  onPublishingComplete,
  state,
  publishingStepId,
}: {
  onPublishingComplete?: () => void
  state: PublishPodSubmitStatus
  publishingStepId?: PublishPodStepId
}) {
  switch (state) {
    case "publishing":
      return (
        <PublishingState
          onPublishingComplete={onPublishingComplete}
          publishingStepId={publishingStepId}
        />
      )
    case "updating":
      return <UpdatingState onUpdatingComplete={onPublishingComplete} />
    case "success":
      return <SuccessState />
    case "error":
      return <ErrorState />
  }
}
