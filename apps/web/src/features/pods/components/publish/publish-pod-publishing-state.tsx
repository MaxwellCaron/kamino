import { IconBox, IconListDetails } from "@tabler/icons-react"
import type { PodSubmitProgressStep } from "@/components/submit-progress"
import type { PublishPodProgress } from "@/features/pods/api/publish-pod-api"
import {
  PodSubmitErrorState,
  PodSubmitLoadingState,
  PodSubmitProgressState,
  PodSubmitSuccessState,
} from "@/components/submit-progress"

export const PUBLISH_POD_STEP_IDS = [1, 2, 3, 4, 5] as const

export type PublishPodStepId = (typeof PUBLISH_POD_STEP_IDS)[number]
export type PublishPodSubmitStatus =
  | "publishing"
  | "updating"
  | "success"
  | "error"

const PUBLISH_POD_STEPS = [
  {
    id: 1,
    title: "Validating source VMs",
    description:
      "Checking the selected Pod folder and source virtual machines.",
  },
  {
    id: 2,
    title: "Preparing Source folder",
    description: "Creating or finding the Source folder inside the Pod.",
  },
  {
    id: 3,
    title: "Full cloning VMs",
    description: "Copying source virtual machines into the Source folder.",
  },
  {
    id: 4,
    title: "Converting templates",
    description: "Turning the cloned virtual machines into reusable templates.",
  },
  {
    id: 5,
    title: "Saving catalog entry",
    description: "Writing the published Pod metadata to the catalog.",
  },
] satisfies [
  PodSubmitProgressStep<PublishPodStepId>,
  ...Array<PodSubmitProgressStep<PublishPodStepId>>,
]

function PublishingState({ progress }: { progress?: PublishPodProgress }) {
  const stepId = getPublishProgressStepId(progress) ?? 1

  return (
    <PodSubmitProgressState
      detail={getPublishProgressDetail(progress)}
      progressValue={getPublishProgressValue(progress)}
      stepId={stepId}
      steps={PUBLISH_POD_STEPS}
      title="Publishing"
    />
  )
}

function UpdatingState() {
  return (
    <PodSubmitLoadingState
      description="Saving the latest changes to this Pod."
      title="Updating"
    />
  )
}

function SuccessState({ podSlug }: { podSlug: string }) {
  return (
    <PodSubmitSuccessState
      title="Published"
      description="Your Pod has been successfully published. View it in the catalog or go directly to its page."
      actions={[
        {
          icon: IconListDetails,
          label: "View Catalog",
          to: "/pods/published",
          variant: "outline",
        },
        {
          icon: IconBox,
          label: "View Pod",
          to: "/pods/$podSlug",
          params: { podSlug },
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
  podSlug,
  progress,
  state,
}: {
  podSlug: string | null
  progress?: PublishPodProgress
  state: PublishPodSubmitStatus
}) {
  switch (state) {
    case "publishing":
      return <PublishingState progress={progress} />
    case "updating":
      return <UpdatingState />
    case "success":
      if (!podSlug) {
        throw new Error(
          "Published Pod slug is required after successful submit"
        )
      }
      return <SuccessState podSlug={podSlug} />
    case "error":
      return <ErrorState />
  }
}

function getPublishProgressStepId(
  progress: PublishPodProgress | undefined
): PublishPodStepId | undefined {
  if (!progress) return undefined

  return PUBLISH_POD_STEP_IDS.includes(progress.step_id as PublishPodStepId)
    ? (progress.step_id as PublishPodStepId)
    : undefined
}

function getPublishProgressValue(progress: PublishPodProgress | undefined) {
  if (!progress) return 4

  const completedRatio =
    progress.total_vms > 0
      ? Math.min(progress.completed_vms, progress.total_vms) /
        progress.total_vms
      : 0

  switch (progress.step_id) {
    case 1:
      return 8
    case 2:
      return 18
    case 3:
      return 22 + completedRatio * 40
    case 4:
      return 65 + completedRatio * 25
    case 5:
      return progress.state === "success" ? 100 : 94
    default:
      return 4
  }
}

function getPublishProgressDetail(progress: PublishPodProgress | undefined) {
  if (!progress?.message) return undefined

  if (
    (progress.step_id === 3 || progress.step_id === 4) &&
    progress.total_vms
  ) {
    return `${progress.message} ${Math.min(
      progress.completed_vms,
      progress.total_vms
    )} / ${progress.total_vms} complete.`
  }

  return progress.message
}
