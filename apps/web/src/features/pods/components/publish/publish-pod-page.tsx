import * as React from "react"
import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import { PublishPodPersonalizeStep } from "./publish-pod-1-personalize"
import { usePublishPodForm } from "./publish-pod-form"
import { PublishPodTasksStep } from "./publish-pod-2-tasks"
import { PublishPodPreviewStep } from "./publish-pod-3-preview"
import { PublishPodStepper, defaultPublishPodStep } from "./publish-pod-stepper"
import type { PublishPodStep } from "./publish-pod-stepper"

export function PublishPodPage() {
  const [step, setStep] = React.useState<PublishPodStep>(defaultPublishPodStep)
  const form = usePublishPodForm()

  return (
    <form
      noValidate
      className="@container/main relative flex flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <Stepper
        value={step}
        onValueChange={(value) => setStep(value)}
        className="w-full flex-1"
      >
        <StepperContent value="personalize" className="w-full">
          <PublishPodPersonalizeStep form={form} />
        </StepperContent>

        <StepperContent value="tasks" className="w-full">
          <PublishPodTasksStep form={form} />
        </StepperContent>

        <StepperContent value="preview" className="w-full">
          <PublishPodPreviewStep form={form} />
        </StepperContent>

        <PublishPodStepper step={step} />
      </Stepper>
    </form>
  )
}
