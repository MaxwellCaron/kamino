import * as React from "react"
import { useStore } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import { uuid } from "@workspace/ui/lib/utils"
import { PublishPodPersonalizeStep } from "./publish-pod-1-personalize"
import { PublishPodAccessStep } from "./publish-pod-2-access"
import { PublishPodVirtualMachinesStep } from "./publish-pod-3-virtual-machines"
import {
  createInitialPublishPodValues,
  usePublishPodForm,
} from "./publish-pod-form"
import { PublishPodTasksStep } from "./publish-pod-4-tasks"
import { PublishPodPreviewStep } from "./publish-pod-5-preview"
import { PublishPodStepper, defaultPublishPodStep } from "./publish-pod-stepper"
import { PublishPodSubmitState } from "./publish-pod-publishing-state"
import type { PublishPodStep } from "./publish-pod-stepper"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PublishPodSubmitStatus } from "./publish-pod-publishing-state"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishPodSourceFolder } from "@/features/pods/api/publish-pod-api"
import {
  publishPodOptionsQueryOptions,
  publishedPodProgressQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"

type PublishPodFieldPath = Parameters<PublishPodFormApi["getFieldMeta"]>[0]
type PublishPodPendingStatus = Extract<
  PublishPodSubmitStatus,
  "publishing" | "updating"
>
type PublishPodFormState = "form" | PublishPodSubmitStatus
type PublishPodSubmitOptions = {
  progressId: string
}
type PublishPodValidationErrors = Awaited<
  ReturnType<PublishPodFormApi["validate"]>
>

type PublishPodPageProps = {
  initialValues?: PublishPodFormValues
  onSubmit?: (
    values: PublishPodFormValues,
    options: PublishPodSubmitOptions
  ) => Promise<void> | void
  pendingSubmitState?: PublishPodPendingStatus
  submitLabel?: string
}

export function PublishPodPage({
  initialValues,
  onSubmit,
  pendingSubmitState = "publishing",
  submitLabel,
}: PublishPodPageProps) {
  const [step, setStep] = React.useState<PublishPodStep>(defaultPublishPodStep)
  const [submitState, setSubmitState] =
    React.useState<PublishPodFormState>("form")
  const [progressId, setProgressId] = React.useState<string | null>(null)
  const [submitCompleted, setSubmitCompleted] = React.useState(false)
  const onSubmitRef = React.useRef(onSubmit)
  const defaultValues = React.useMemo(
    () => initialValues ?? createInitialPublishPodValues(),
    [initialValues]
  )
  React.useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  const handleValidatedSubmit = React.useCallback(
    (values: PublishPodFormValues) => {
      const nextProgressId = uuid()
      let submitPromise: Promise<unknown>

      setProgressId(nextProgressId)
      setSubmitCompleted(false)

      try {
        submitPromise = Promise.resolve(
          onSubmitRef.current?.(values, { progressId: nextProgressId })
        )
      } catch {
        setSubmitState("error")
        return
      }

      setSubmitState(pendingSubmitState)
      void submitPromise
        .then(() => {
          if (pendingSubmitState === "updating") {
            setSubmitState("success")
            return
          }
          setSubmitCompleted(true)
        })
        .catch(() => setSubmitState("error"))
    },
    [pendingSubmitState]
  )
  const form = usePublishPodForm({
    defaultValues,
    onSubmit: handleValidatedSubmit,
  })
  const submissionAttempts = useStore(
    form.store,
    (state) => state.submissionAttempts
  )
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)
  const publishOptionsQuery = useQuery(publishPodOptionsQueryOptions)
  const publishProgressQuery = useQuery(
    publishedPodProgressQueryOptions(
      progressId,
      submitState === "publishing"
    )
  )

  React.useEffect(() => {
    if (submitState !== "publishing") {
      return
    }

    if (publishProgressQuery.data?.state === "error") {
      setSubmitState("error")
      return
    }

    if (submitCompleted && publishProgressQuery.data?.state === "success") {
      setSubmitState("success")
    }
  }, [publishProgressQuery.data?.state, submitCompleted, submitState])

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

  const markFieldsTouched = React.useCallback(
    (fields: Array<PublishPodFieldPath>) => {
      fields.forEach((field) => {
        form.setFieldMeta(field, (meta) => ({
          ...meta,
          isTouched: true,
        }))
      })
    },
    [form]
  )

  const getTaskFieldPaths = React.useCallback(() => {
    const tasks = form.getFieldValue("tasks")
    const fields: Array<PublishPodFieldPath> = ["tasks"]

    tasks.forEach((task, taskIndex) => {
      fields.push(
        `tasks[${taskIndex}].title` as PublishPodFieldPath,
        `tasks[${taskIndex}].content` as PublishPodFieldPath
      )

      task.questions.forEach((_, questionIndex) => {
        fields.push(
          `tasks[${taskIndex}].questions[${questionIndex}].title` as PublishPodFieldPath,
          `tasks[${taskIndex}].questions[${questionIndex}].answerOutline` as PublishPodFieldPath,
          `tasks[${taskIndex}].questions[${questionIndex}].hint` as PublishPodFieldPath
        )
      })
    })

    return fields
  }, [form])

  const getSubmitFieldPaths = React.useCallback(() => {
    const fields: Array<PublishPodFieldPath> = [
      "title",
      "description",
      "image",
      "creators",
      "status",
      "audience",
      "source_folder",
      "virtual_machines",
      "tasks",
    ]

    return [...fields, ...getTaskFieldPaths()]
  }, [getTaskFieldPaths])

  const firstInvalidStepFromErrors = React.useCallback(
    (errors: PublishPodValidationErrors): PublishPodStep => {
      const errorKeys = Object.keys(errors)
      const hasErrorFor = (fields: ReadonlyArray<string>) =>
        errorKeys.some((key) =>
          fields.some((field) => key === field || key.startsWith(`${field}[`))
        )

      if (hasErrorFor(["title", "description", "image", "creators"])) {
        return "personalize"
      }
      if (hasErrorFor(["status", "audience"])) {
        return "access"
      }
      if (hasErrorFor(["source_folder", "virtual_machines"])) {
        return "virtual-machines"
      }
      if (hasErrorFor(["tasks"])) {
        return "tasks"
      }

      return "preview"
    },
    []
  )

  const validateFormForSubmit = React.useCallback(async () => {
    const errors = await form.validate("submit")

    const tasks = form.getFieldValue("tasks")
    if (tasks.length > 0) {
      await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
    }

    const submitFields = getSubmitFieldPaths()
    const isValid = Object.keys(errors).length === 0 && !hasFieldErrors(submitFields)

    if (!isValid) {
      markFieldsTouched(submitFields)
      setStep(firstInvalidStepFromErrors(errors))
    }

    return isValid
  }, [
    firstInvalidStepFromErrors,
    form,
    getSubmitFieldPaths,
    hasFieldErrors,
    markFieldsTouched,
  ])

  const validateStep = React.useCallback(async () => {
    const invalidateCurrentStep = (fields: Array<PublishPodFieldPath>) => {
      const isValid = !hasFieldErrors(fields)

      if (!isValid) {
        markFieldsTouched(fields)
      }

      return isValid
    }

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

      return invalidateCurrentStep(fields)
    }

    if (step === "access") {
      const fields = ["audience"] satisfies Array<PublishPodFieldPath>

      await Promise.all([
        form.validateField("status", "submit"),
        form.validateField("audience", "submit"),
      ])

      return invalidateCurrentStep(fields)
    }

    if (step === "virtual-machines") {
      const fields = ["source_folder"] satisfies Array<PublishPodFieldPath>

      await Promise.all([form.validateField("source_folder", "submit")])

      return invalidateCurrentStep(fields)
    }

    if (step === "tasks") {
      await form.validateField("tasks", "submit")

      const tasks = form.getFieldValue("tasks")
      if (tasks.length > 0) {
        await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
      }

      return invalidateCurrentStep(getTaskFieldPaths())
    }

    return true
  }, [form, getTaskFieldPaths, hasFieldErrors, markFieldsTouched, step])

  const submitForm = React.useCallback(async () => {
    const isValid = await validateFormForSubmit()
    if (!isValid) {
      return false
    }

    await form.handleSubmit()
    return true
  }, [form, validateFormForSubmit])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      await submitForm()
    },
    [submitForm]
  )

  if (submitState !== "form") {
    return (
      <div className="@container/main relative flex flex-1 flex-col">
        <PublishPodSubmitState
          state={submitState}
          progress={
            submitState === "publishing"
              ? publishProgressQuery.data
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <form
      noValidate
      className="@container/main relative flex flex-1 flex-col"
      onSubmit={handleSubmit}
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
            submissionAttempts={submissionAttempts}
            sourceFolders={
              publishOptionsQuery.data?.source_folders ??
              ([] satisfies Array<PublishPodSourceFolder>)
            }
            sourceFoldersError={publishOptionsQuery.error}
            sourceFoldersLoading={publishOptionsQuery.isLoading}
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
          onSubmitConfirm={submitForm}
        />
      </Stepper>
    </form>
  )
}
