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
import {
  PublishPodStepper,
  defaultPublishPodStep,
  steps,
} from "./publish-pod-stepper"
import { PublishPodSubmitState } from "./publish-pod-publishing-state"
import type { PublishPodStep } from "./publish-pod-stepper"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PublishPodSubmitStatus } from "./publish-pod-publishing-state"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"
import { PodPageSkeleton } from "@/features/pods/components/pod-page-skeleton"
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
type PublishPodSubmitResult = {
  slug: string
}
type PublishPodValidationErrors = Awaited<
  ReturnType<PublishPodFormApi["validate"]>
>

type PublishPodPageProps = {
  initialValues?: PublishPodFormValues
  publishedPodId?: string
  onSubmit: (
    values: PublishPodFormValues,
    options: PublishPodSubmitOptions
  ) => Promise<PublishPodSubmitResult> | PublishPodSubmitResult
  pendingSubmitState?: PublishPodPendingStatus
  submitLabel?: string
}

export function PublishPodPage({
  initialValues,
  publishedPodId,
  onSubmit,
  pendingSubmitState = "publishing",
  submitLabel,
}: PublishPodPageProps) {
  const [step, setStep] = React.useState<PublishPodStep>(defaultPublishPodStep)
  const [submitState, setSubmitState] =
    React.useState<PublishPodFormState>("form")
  const [progressId, setProgressId] = React.useState<string | null>(null)
  const [savedPodSlug, setSavedPodSlug] = React.useState<string | null>(null)
  const [submitErrorMessage, setSubmitErrorMessage] = React.useState<
    string | null
  >(null)
  const [submittedValues, setSubmittedValues] =
    React.useState<PublishPodFormValues | null>(null)
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
      let submitPromise: Promise<PublishPodSubmitResult>

      setProgressId(nextProgressId)
      setSavedPodSlug(null)
      setSubmitErrorMessage(null)
      setSubmittedValues(values)
      setSubmitCompleted(false)

      try {
        submitPromise = Promise.resolve(
          onSubmitRef.current(values, { progressId: nextProgressId })
        )
      } catch (error) {
        setSubmitErrorMessage(getErrorMessage(error))
        setSubmitState("error")
        return
      }

      setSubmitState(pendingSubmitState)
      void submitPromise
        .then((result) => {
          setSavedPodSlug(result.slug)
          if (pendingSubmitState === "updating") {
            setSubmitState("success")
            return
          }
          setSubmitCompleted(true)
        })
        .catch((error) => {
          setSubmitErrorMessage(getErrorMessage(error))
          setSubmitState("error")
        })
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
  const publishOptionsQuery = useQuery(
    publishPodOptionsQueryOptions(publishedPodId)
  )
  const publishProgressQuery = useQuery(
    publishedPodProgressQueryOptions(
      progressId,
      submitState === "publishing" || submitState === "updating"
    )
  )

  React.useEffect(() => {
    if (submitState !== "publishing" && submitState !== "updating") {
      return
    }

    if (publishProgressQuery.data?.state === "error") {
      setSubmitErrorMessage(publishProgressQuery.data.message)
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
  const isLoadingFormOptions =
    usersQuery.isLoading || groupsQuery.isLoading || publishOptionsQuery.isLoading

  const principalOptionMap = React.useMemo(
    (): Map<string, PrincipalOption> =>
      new Map(principalOptions.map((option) => [option.id, option])),
    [principalOptions]
  )

  const submittedUpdateVirtualMachines = React.useMemo(() => {
    if (!submittedValues) return []

    const selected = new Set(submittedValues.update_virtual_machines)
    if (selected.size === 0) return []

    return submittedValues.virtual_machines
      .filter((vm) => selected.has(vm.id))
      .map((vm) => ({
        id: vm.id,
        name: vm.name,
      }))
  }, [submittedValues])

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
    const fields = steps.flatMap((s) => s.fields) as Array<PublishPodFieldPath>
    return [...fields, ...getTaskFieldPaths()]
  }, [getTaskFieldPaths])

  const firstInvalidStepFromErrors = React.useCallback(
    (errors: PublishPodValidationErrors): PublishPodStep => {
      const errorKeys = Object.keys(errors)
      const hasErrorFor = (fields: ReadonlyArray<string>) =>
        errorKeys.some((key) =>
          fields.some((field) => key === field || key.startsWith(`${field}[`))
        )

      return steps.find((s) => hasErrorFor(s.fields))?.value ?? "preview"
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
    const isValid =
      Object.keys(errors).length === 0 && !hasFieldErrors(submitFields)

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
    const fields = (steps.find((s) => s.value === step)?.fields ??
      []) as Array<PublishPodFieldPath>

    await Promise.all(
      fields.map((field) => form.validateField(field, "submit"))
    )

    if (step === "tasks") {
      const tasks = form.getFieldValue("tasks")
      if (tasks.length > 0) {
        await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
      }
    }

    const blockingFields = step === "tasks" ? getTaskFieldPaths() : fields
    if (hasFieldErrors(blockingFields)) {
      markFieldsTouched(blockingFields)
      return false
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

  const handleBackToForm = React.useCallback(() => {
    setSubmitState("form")
    setProgressId(null)
    setSubmitCompleted(false)
  }, [])

  if (submitState !== "form") {
    return (
      <div className="@container/main relative flex flex-1 flex-col">
        <PublishPodSubmitState
          state={submitState}
          errorMessage={submitErrorMessage}
          onBackToForm={handleBackToForm}
          podSlug={savedPodSlug}
          progress={
            submitState === "publishing" || submitState === "updating"
              ? publishProgressQuery.data
              : undefined
          }
          updateVirtualMachines={submittedUpdateVirtualMachines}
        />
      </div>
    )
  }

  if (isLoadingFormOptions) {
    return <PodPageSkeleton />
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
            isEditing={!!publishedPodId}
            submissionAttempts={submissionAttempts}
            podFolders={
              publishOptionsQuery.data?.source_folders ??
              ([] satisfies Array<PublishPodFolder>)
            }
            podFoldersError={publishOptionsQuery.error}
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to save published pod."
}
