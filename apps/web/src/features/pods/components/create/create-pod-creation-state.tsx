import { BoxIcon, PackageAddIcon, ReloadIcon } from "@hugeicons/core-free-icons"
import type {
  ProgressStateStep,
  ProgressStateSteps,
} from "@/components/progress-state/progress-state"
import type {
  CreatePodProgress,
  CreatePodResult,
} from "@/features/pods/api/create-pod-api"
import {
  ProgressErrorState,
  ProgressState,
  ProgressSuccessState,
} from "@/components/progress-state/progress-state"

const CREATE_POD_STEP_IDS = [1, 2, 3, 4, 5, 6, 7] as const

export type CreatePodStepId = (typeof CREATE_POD_STEP_IDS)[number]
export type CreatePodSubmitStatus = "creating" | "success" | "error"

const CREATE_POD_VALIDATING_STEP = {
  id: 1,
  title: "Validating request",
  description: "Checking the Pod name and selected templates.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_FOLDERS_STEP = {
  id: 2,
  title: "Creating folders",
  description: "Preparing the Pod inventory folders and access policy.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_NETWORK_STEP = {
  id: 3,
  title: "Reserving dev network",
  description: "Reserving a developer network and checking the matching VNet.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_CLONING_STEP = {
  id: 4,
  title: "Cloning virtual machines",
  description: "Copying the selected VM templates into the new Pod workspace.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_WAITING_STEP = {
  id: 5,
  title: "Preparing virtual machines",
  description: "Waiting for cloned virtual machines to finish preparing.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_CONFIGURING_STEP = {
  id: 6,
  title: "Configuring VNet bridges",
  description:
    "Connecting the router and workload virtual machines to the dev VNet.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_ROUTER_STEP = {
  id: 7,
  title: "Starting router",
  description: "Applying router cloud-init snippets and starting the router.",
} satisfies ProgressStateStep<CreatePodStepId>

const CREATE_POD_FOLDER_STEPS = [
  CREATE_POD_VALIDATING_STEP,
  CREATE_POD_FOLDERS_STEP,
] satisfies ProgressStateSteps<CreatePodStepId>

const CREATE_POD_WITH_VM_STEPS = [
  CREATE_POD_VALIDATING_STEP,
  CREATE_POD_FOLDERS_STEP,
  CREATE_POD_CLONING_STEP,
  CREATE_POD_WAITING_STEP,
] satisfies ProgressStateSteps<CreatePodStepId>

const CREATE_POD_WITH_ROUTER_STEPS = [
  CREATE_POD_VALIDATING_STEP,
  CREATE_POD_FOLDERS_STEP,
  CREATE_POD_NETWORK_STEP,
  CREATE_POD_CLONING_STEP,
  CREATE_POD_WAITING_STEP,
  CREATE_POD_CONFIGURING_STEP,
  CREATE_POD_ROUTER_STEP,
] satisfies ProgressStateSteps<CreatePodStepId>

function getCreatePodSteps({
  hasVirtualMachines,
  hasRouter,
}: {
  hasVirtualMachines: boolean
  hasRouter: boolean
}) {
  if (hasRouter) return CREATE_POD_WITH_ROUTER_STEPS
  if (hasVirtualMachines) return CREATE_POD_WITH_VM_STEPS
  return CREATE_POD_FOLDER_STEPS
}

function getCreateProgressStepId(
  progress: CreatePodProgress | undefined,
  steps: ProgressStateSteps<CreatePodStepId>
): CreatePodStepId | undefined {
  if (!progress) return undefined

  return steps.some((step) => step.id === progress.step_id)
    ? (progress.step_id as CreatePodStepId)
    : undefined
}

export function CreatePodSubmitState({
  createdPod,
  errorMessage,
  hasVirtualMachines,
  hasRouter,
  onCreateAnother,
  onCreatingComplete,
  onRetry,
  progress,
  state,
}: {
  createdPod?: CreatePodResult | null
  errorMessage?: string | null
  hasVirtualMachines: boolean
  hasRouter: boolean
  onCreateAnother: () => void
  onCreatingComplete?: () => void
  onRetry: () => void
  progress?: CreatePodProgress
  state: CreatePodSubmitStatus
}) {
  const steps = getCreatePodSteps({ hasVirtualMachines, hasRouter })
  const createdPodFolderId = createdPod?.folder_id ?? null

  switch (state) {
    case "creating":
      return (
        <ProgressState
          detail={progress?.message}
          onComplete={onCreatingComplete}
          stepId={getCreateProgressStepId(progress, steps)}
          steps={steps}
          title="Creating"
        />
      )
    case "success":
      return (
        <ProgressSuccessState
          title="Created"
          description="Your Pod has been created. Create another Pod or open the new Pod from the inventory view."
          actions={[
            {
              icon: PackageAddIcon,
              label: "Create Another",
              onClick: onCreateAnother,
              to: "/pods/create",
              variant: "secondary",
            },
            {
              icon: BoxIcon,
              label: "View Pod",
              ...(createdPodFolderId
                ? {
                    to: "/inventory/items/$itemId" as const,
                    params: { itemId: createdPodFolderId },
                  }
                : {
                    to: "/" as const,
                  }),
            },
          ]}
        />
      )
    case "error":
      return (
        <ProgressErrorState
          title="Creation Failed"
          description={
            errorMessage ??
            "Your Pod failed to create. Please try again or contact support if the issue persists."
          }
          actions={[
            {
              icon: ReloadIcon,
              label: "Try Again",
              onClick: onRetry,
              variant: "secondary",
            },
          ]}
        />
      )
  }
}
