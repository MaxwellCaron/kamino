import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import { PublishPodPersonalizeStep } from "./publish-pod-1-personalize"
import { PublishPodAccessStep } from "./publish-pod-2-access"
import { PublishPodVirtualMachinesStep } from "./publish-pod-3-virtual-machines"
import { usePublishPodForm } from "./publish-pod-form"
import { PublishPodTasksStep } from "./publish-pod-4-tasks"
import { PublishPodPreviewStep } from "./publish-pod-5-preview"
import { PublishPodStepper, defaultPublishPodStep } from "./publish-pod-stepper"
import type { PublishPodStep } from "./publish-pod-stepper"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"

type PublishPodFieldPath = Parameters<PublishPodFormApi["getFieldMeta"]>[0]

export function PublishPodPage() {
  const [step, setStep] = React.useState<PublishPodStep>(defaultPublishPodStep)
  const form = usePublishPodForm()
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)

  const principalOptions = React.useMemo(
    () => buildPrincipalOptions(usersQuery.data ?? [], groupsQuery.data ?? []),
    [groupsQuery.data, usersQuery.data]
  )

  const principalOptionMap = React.useMemo(
    (): Map<string, PrincipalOption> =>
      new Map(principalOptions.map((option) => [option.id, option])),
    [principalOptions]
  )

  const hasFieldErrors = React.useCallback(
    (fields: Array<PublishPodFieldPath>) =>
      fields.some(
        (field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0
      ),
    [form]
  )

  const validateStep = React.useCallback(async () => {
    if (step === "personalize") {
      const fields = [
        "title",
        "description",
        "image",
        "creators",
      ] satisfies Array<PublishPodFieldPath>

      await Promise.all([
        form.validateField("title", "submit"),
        form.validateField("description", "submit"),
        form.validateField("image", "submit"),
        form.validateField("creators", "submit"),
      ])

      return !hasFieldErrors(fields)
    }

    if (step === "access") {
      const fields = ["audience"] satisfies Array<PublishPodFieldPath>

      await Promise.all([
        form.validateField("status", "submit"),
        form.validateField("audience", "submit"),
      ])

      return !hasFieldErrors(fields)
    }

    if (step === "virtual-machines") {
      const fields = ["source_folder"] satisfies Array<PublishPodFieldPath>

      await Promise.all([
        form.validateField("source_folder", "submit"),
      ])

      return !hasFieldErrors(fields)
    }

    if (step === "tasks") {
      await form.validateField("tasks", "submit")

      const tasks = form.getFieldValue("tasks")
      if (tasks.length > 0) {
        await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
      }

      const fields: Array<PublishPodFieldPath> = ["tasks"]

      tasks.forEach((task, taskIndex) => {
        fields.push(
          `tasks[${taskIndex}].title` as PublishPodFieldPath,
          `tasks[${taskIndex}].content` as PublishPodFieldPath
        )

        task.questions.forEach((_, questionIndex) => {
          fields.push(
            `tasks[${taskIndex}].questions[${questionIndex}].title` as PublishPodFieldPath,
            `tasks[${taskIndex}].questions[${questionIndex}].answerOutline` as PublishPodFieldPath
          )
        })
      })

      return !hasFieldErrors(fields)
    }

    return true
  }, [form, hasFieldErrors, step])

  return (
    <form
      noValidate
      className="@container/main relative flex flex-1 flex-col"
      onSubmit={async (event) => {
        event.preventDefault()
        await form.validateField("title", "submit")
        await form.validateField("description", "submit")
        await form.validateField("image", "submit")
        await form.validateField("creators", "submit")
        await form.validateField("audience", "submit")
        await form.validateField("source_folder", "submit")
        await form.validateField("tasks", "submit")

        const tasks = form.getFieldValue("tasks")
        if (tasks.length > 0) {
          await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
        }

        await form.handleSubmit()
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
          <PublishPodPersonalizeStep
            form={form}
            principalOptionMap={principalOptionMap}
            principalOptions={principalOptions}
          />
        </StepperContent>

        <StepperContent value="access" className="w-full">
          <PublishPodAccessStep
            form={form}
            principalOptionMap={principalOptionMap}
            principalOptions={principalOptions}
          />
        </StepperContent>

        <StepperContent value="virtual-machines" className="w-full">
          <PublishPodVirtualMachinesStep form={form} />
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
