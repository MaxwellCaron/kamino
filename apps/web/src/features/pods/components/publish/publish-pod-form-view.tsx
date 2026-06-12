import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import { PublishPodPersonalizeStep } from "./publish-pod-1-personalize"
import { PublishPodAccessStep } from "./publish-pod-2-access"
import { PublishPodVirtualMachinesStep } from "./publish-pod-3-virtual-machines"
import { PublishPodTasksStep } from "./publish-pod-4-tasks"
import { PublishPodPreviewStep } from "./publish-pod-5-preview"
import { PublishPodStepper } from "./publish-pod-stepper"
import type { PublishPodStep } from "./publish-pod-steps"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"

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
  submitLabel,
  onSubmitConfirm,
}: PublishPodFormViewProps) {
  return (
    <form
      noValidate
      className="@container/main relative flex flex-1 flex-col"
      action={() => {
        void onSubmitConfirm()
      }}
    >
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
          />
        </StepperContent>

        <StepperContent value="tasks" className="w-full">
          <PublishPodTasksStep
            form={form}
            submissionAttempts={submissionAttempts}
          />
        </StepperContent>

        <StepperContent value="preview" className="w-full">
          <PublishPodPreviewStep form={form} />
        </StepperContent>

        <PublishPodStepper
          step={step}
          submitLabel={submitLabel}
          onSubmitConfirm={onSubmitConfirm}
        />
      </Stepper>
    </form>
  )
}
