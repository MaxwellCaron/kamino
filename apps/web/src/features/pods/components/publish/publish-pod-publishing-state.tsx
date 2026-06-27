import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  PackageIcon,
  ComputerIcon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { PUBLISH_POD_STEP_IDS } from "./publish-pod-submit-types"
import type {
  PublishPodStepId,
  PublishPodSubmitStatus,
  PublishPodUpdateVirtualMachine,
} from "./publish-pod-submit-types"
import type { ProgressStateStep } from "@/components/progress-state/progress-state"
import type { PublishPodProgress } from "@/features/pods/api/publish-pod-api"
import {
  ProgressErrorState,
  ProgressLoadingState,
  ProgressState,
  ProgressSuccessState,
} from "@/components/progress-state/progress-state"

const PUBLISH_POD_STEPS = [
  {
    id: 1,
    title: "Validating Pod Folder VMs",
    description: "Checking the selected Pod Folder and Pod VMs.",
  },
  {
    id: 2,
    title: "Preparing Pod Template Folder",
    description:
      "Creating or finding the Pod Template Folder inside the Pod Folder.",
  },
  {
    id: 3,
    title: "Cloning & converting VMs",
    description:
      "Copying Pod VMs into the Pod Template Folder and turning them into Pod Template VMs.",
  },
  {
    id: 4,
    title: "Saving catalog entry",
    description: "Writing the published Pod metadata to the catalog.",
  },
] satisfies [
  ProgressStateStep<PublishPodStepId>,
  ...Array<ProgressStateStep<PublishPodStepId>>,
]

const UPDATE_POD_TEMPLATE_STEPS = [
  {
    id: 1,
    title: "Validating selected VMs",
    description: "Checking the published Pod and selected Pod VMs.",
  },
  {
    id: 2,
    title: "Preparing Pod Template Folder",
    description: "Preparing selected Pod Template VMs for update.",
  },
  {
    id: 3,
    title: "Cloning & converting VMs",
    description:
      "Rebuilding selected Pod Template VMs from the current Pod VMs.",
  },
  {
    id: 4,
    title: "Saving catalog entry",
    description: "Writing the updated published Pod metadata to the catalog.",
  },
] satisfies [
  ProgressStateStep<PublishPodStepId>,
  ...Array<ProgressStateStep<PublishPodStepId>>,
]

function PublishingState({ progress }: { progress?: PublishPodProgress }) {
  const stepId = getPublishProgressStepId(progress) ?? 1

  return (
    <ProgressState
      detail={progress?.message}
      stepId={stepId}
      steps={PUBLISH_POD_STEPS}
      title="Publishing"
    />
  )
}

function UpdatingState({
  progress,
  updateVirtualMachines,
}: {
  progress?: PublishPodProgress
  updateVirtualMachines: Array<PublishPodUpdateVirtualMachine>
}) {
  if (updateVirtualMachines.length > 0) {
    const stepId = getPublishProgressStepId(progress) ?? 1
    const templateLabel =
      updateVirtualMachines.length === 1
        ? "Pod Template VM"
        : "Pod Template VMs"

    return (
      <ProgressState
        detail={
          progress?.message ??
          `Rebuilding ${templateLabel} in the Pod Template Folder.`
        }
        stepId={stepId}
        steps={UPDATE_POD_TEMPLATE_STEPS}
        title={`Updating ${updateVirtualMachines.length} ${templateLabel}`}
      >
        <div
          className="flex w-full max-w-md flex-col items-center gap-2"
          aria-label="Virtual machines selected for update"
        >
          <span className="text-sm font-medium">Selected VMs</span>
          <div className="flex flex-wrap justify-center gap-2">
            {updateVirtualMachines.map((vm) => (
              <Badge key={vm.id} variant="secondary">
                <HugeiconsIcon icon={ComputerIcon} data-icon="inline-start" />
                {vm.name}
              </Badge>
            ))}
          </div>
        </div>
      </ProgressState>
    )
  }

  return (
    <ProgressLoadingState
      description="Saving the latest changes to this Pod."
      title="Updating"
    />
  )
}

function SuccessState({ podSlug }: { podSlug: string }) {
  return (
    <ProgressSuccessState
      title="Published"
      description="Your Pod has been successfully published. View it in the catalog or go directly to its page."
      actions={[
        {
          icon: ListViewIcon,
          label: "View Catalog",
          to: "/pods/published",
          variant: "outline",
        },
        {
          icon: PackageIcon,
          label: "View Pod",
          to: "/pods/$podSlug",
          params: { podSlug },
        },
      ]}
    />
  )
}

function ErrorState({
  message,
  onBackToForm,
}: {
  message?: string | null
  onBackToForm: () => void
}) {
  return (
    <ProgressErrorState
      title="Publishing Failed"
      description={
        message ??
        "Your Pod failed to publish. Please try again or contact support if the issue persists."
      }
      actions={[
        {
          icon: ArrowLeft01Icon,
          label: "Back to Form",
          onClick: onBackToForm,
          variant: "outline",
        },
        {
          icon: ListViewIcon,
          label: "View Catalog",
          to: "/pods/published",
          variant: "secondary",
        },
      ]}
    />
  )
}

const EMPTY_UPDATE_VIRTUAL_MACHINES: Array<PublishPodUpdateVirtualMachine> = []

export function PublishPodSubmitState({
  podSlug,
  progress,
  state,
  updateVirtualMachines = EMPTY_UPDATE_VIRTUAL_MACHINES,
  errorMessage,
  onBackToForm,
}: {
  podSlug: string | null
  progress?: PublishPodProgress
  state: PublishPodSubmitStatus
  updateVirtualMachines?: Array<PublishPodUpdateVirtualMachine>
  errorMessage?: string | null
  onBackToForm: () => void
}) {
  switch (state) {
    case "publishing":
      return <PublishingState progress={progress} />
    case "updating":
      return (
        <UpdatingState
          progress={progress}
          updateVirtualMachines={updateVirtualMachines}
        />
      )
    case "success":
      if (!podSlug) {
        throw new Error(
          "Published Pod slug is required after successful submit"
        )
      }
      return <SuccessState podSlug={podSlug} />
    case "error":
      return <ErrorState message={errorMessage} onBackToForm={onBackToForm} />
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
