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

  const validateStep = React.useCallback(async () => {
    if (step === "personalize") {
      await Promise.all([
        form.validateField("title", "submit"),
        form.validateField("description", "submit"),
        form.validateField("image", "submit"),
        form.validateField("creators", "submit"),
        form.validateField("source_folder", "submit"),
      ])

      return true
    }

    if (step === "tasks") {
      await form.validateField("tasks", "submit")

      const tasks = form.getFieldValue("tasks")
      if (tasks.length > 0) {
        await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
      }

      return tasks.every(
        (task) =>
          task.title.trim().length > 0 &&
          task.content.trim().length > 0 &&
          task.questions.every(
            (question) =>
              question.title.trim().length > 0 &&
              question.answerOutline.trim().length > 0
          )
      )
    }

    return true
  }, [form, step])

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
        onValidate={(_, direction) => {
          if (direction === "prev") return true
          return validateStep()
        }}
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
