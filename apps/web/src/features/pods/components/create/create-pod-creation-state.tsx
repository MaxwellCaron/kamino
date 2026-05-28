import { IconCubePlus, IconPackage, IconRefresh } from "@tabler/icons-react"
import type {
  PodSubmitProgressStep,
  PodSubmitProgressSteps,
} from "@/components/submit-progress"
import {
  PodSubmitErrorState,
  PodSubmitProgressState,
  PodSubmitSuccessState,
} from "@/components/submit-progress"

export const CREATE_POD_STEP_IDS = [1, 2] as const
export const CREATE_POD_STEP_INTERVAL_MS = 2_000

export type CreatePodStepId = (typeof CREATE_POD_STEP_IDS)[number]
export type CreatePodSubmitStatus = "creating" | "success" | "error"

const CREATE_POD_FOLDER_STEP = {
  id: 1,
  title: "Creating folder",
  description: "Preparing the inventory folder and access policy for this Pod.",
} satisfies PodSubmitProgressStep<CreatePodStepId>

const CREATE_POD_VM_STEP = {
  id: 2,
  title: "Cloning VM templates",
  description: "Copying selected template VMs into the new Pod workspace.",
} satisfies PodSubmitProgressStep<CreatePodStepId>

const CREATE_POD_FOLDER_STEPS = [
  CREATE_POD_FOLDER_STEP,
] satisfies PodSubmitProgressSteps<CreatePodStepId>

const CREATE_POD_WITH_VM_STEPS = [
  CREATE_POD_FOLDER_STEP,
  CREATE_POD_VM_STEP,
] satisfies PodSubmitProgressSteps<CreatePodStepId>

function getCreatePodSteps(hasVirtualMachines: boolean) {
  return hasVirtualMachines ? CREATE_POD_WITH_VM_STEPS : CREATE_POD_FOLDER_STEPS
}

export function CreatePodSubmitState({
  hasVirtualMachines,
  onCreatingComplete,
  onReset,
  state,
}: {
  hasVirtualMachines: boolean
  onCreatingComplete?: () => void
  onReset: () => void
  state: CreatePodSubmitStatus
}) {
  switch (state) {
    case "creating":
      return (
        <PodSubmitProgressState
          intervalMs={CREATE_POD_STEP_INTERVAL_MS}
          onComplete={onCreatingComplete}
          steps={getCreatePodSteps(hasVirtualMachines)}
          title="Creating"
        />
      )
    case "success":
      return (
        <PodSubmitSuccessState
          title="Created"
          description="Your Pod has been created. Create another Pod or open the new Pod from the inventory view."
          actions={[
            {
              icon: IconCubePlus,
              label: "Create Another",
              onClick: onReset,
              to: "/pods/create",
              variant: "secondary",
            },
            {
              icon: IconPackage,
              label: "View Pod",
              to: "/",
            },
          ]}
        />
      )
    case "error":
      return (
        <PodSubmitErrorState
          title="Creation Failed"
          description="Your Pod failed to create. Please try again or contact support if the issue persists."
          actions={[
            {
              icon: IconRefresh,
              label: "Try Again",
              onClick: onReset,
              to: "/pods/create",
              variant: "secondary",
            },
          ]}
        />
      )
  }
}
