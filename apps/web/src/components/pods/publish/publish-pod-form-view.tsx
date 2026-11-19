import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"
import type { PrincipalOption } from "@/lib/inventory/inventory-types"
import { PublishPodAccessStep } from "@/components/pods/publish/publish-pod-2-access"
import type { PublishPodFolder } from "@/lib/pods/publish-pod-api"
import type { PublishPodFormApi } from "@/hooks/pods/use-publish-pod-form"
import { PublishPodPersonalizeStep } from "@/components/pods/publish/publish-pod-1-personalize"
import { PublishPodPreviewStep } from "@/components/pods/publish/publish-pod-5-preview"
import type { PublishPodStep } from "@/lib/pods/publish/publish-pod-steps"
import { PublishPodStepper } from "@/components/pods/publish/publish-pod-stepper"
import { PublishPodTasksStep } from "@/components/pods/publish/publish-pod-4-tasks"
import { PublishPodVirtualMachinesStep } from "@/components/pods/publish/publish-pod-3-virtual-machines"

type PublishPodFormViewProps = {
  step: PublishPodStep
  onStepChange: (step: PublishPodStep) => void
  onValidateStep: (direction: "next" | "prev") => boolean | Promise<boolean>
  form: PublishPodFormApi
  principalOptionMap: Map<string, PrincipalOption>
  principalOptions: Array<PrincipalOption>
  submissionAttempts: number
  publishedPodId?: string
  podFolders: Array<PublishPodFolder>
  podFoldersError: Error | null
  cloneTargets: Array<PodCloneTarget>
  submitLabel?: string
  onSubmitConfirm: () => Promise<boolean>
}

export function PublishPodFormView({
  step,
  onStepChange,
  onValidateStep,
  form,
  principalOptionMap,
  principalOptions,
  submissionAttempts,
  publishedPodId,
  podFolders,
  podFoldersError,
  cloneTargets,
  submitLabel,
  onSubmitConfirm,
}: PublishPodFormViewProps) {
  return (
    <Stepper
      value={step}
      onValueChange={(value) => onStepChange(value)}
      onValidate={(_, direction) => {
        if (direction === "prev") return true
        return onValidateStep(direction)
      }}
      className="w-full flex-1"
    >
      <StepperContent value="personalize" className="w-full">
        <PublishPodPersonalizeStep
          form={form}
          principalOptionMap={principalOptionMap}
          principalOptions={principalOptions}
          submissionAttempts={submissionAttempts}
        />
      </StepperContent>

      <StepperContent value="access" className="w-full">
        <PublishPodAccessStep
          form={form}
          principalOptionMap={principalOptionMap}
          principalOptions={principalOptions}
          submissionAttempts={submissionAttempts}
        />
      </StepperContent>

      <StepperContent value="virtual-machines" className="w-full">
        <PublishPodVirtualMachinesStep
          form={form}
          isEditing={!!publishedPodId}
          submissionAttempts={submissionAttempts}
          podFolders={podFolders}
          podFoldersError={podFoldersError}
          cloneTargets={cloneTargets}
        />
      </StepperContent>

      <StepperContent value="tasks" className="w-full">
        <PublishPodTasksStep
          form={form}
          submissionAttempts={submissionAttempts}
        />
      </StepperContent>

      <StepperContent value="preview" className="w-full">
        <PublishPodPreviewStep
          form={form}
          podFolders={podFolders}
          cloneTargets={cloneTargets}
        />
      </StepperContent>

      <PublishPodStepper
        step={step}
        submitLabel={submitLabel}
        onSubmitConfirm={onSubmitConfirm}
      />
    </Stepper>
  )
}
