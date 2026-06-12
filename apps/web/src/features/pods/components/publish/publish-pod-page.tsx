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
} from "./publish-pod-stepper"
import { defaultPublishPodStep, steps } from "./publish-pod-steps"
import { PublishPodSubmitState } from "./publish-pod-publishing-state"
import type { PublishPodStep } from "./publish-pod-steps"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PublishPodSubmitStatus } from "./publish-pod-submit-types"
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
type PublishPodSubmitState = {
  state: PublishPodFormState
  savedPodSlug: string | null
  errorMessage: string | null
}
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
  const [submitStatus, setSubmitStatus] = React.useState<PublishPodSubmitState>(
    {
      state: "form",
      savedPodSlug: null,
      errorMessage: null,
    }
  )
  const [progressId, setProgressId] = React.useState<string | null>(null)
  const [submittedValues, setSubmittedValues] =
    React.useState<PublishPodFormValues | null>(null)
  const submitCompletedRef = React.useRef(false)
  const onSubmitRef = React.useRef(onSubmit)
  const submitState = submitStatus.state
  const savedPodSlug = submitStatus.savedPodSlug
  const defaultValues = React.useMemo(
    () => initialValues ?? createInitialPublishPodValues(),
    [initialValues]
  )
  onSubmitRef.current = onSubmit

  const handleValidatedSubmit = React.useCallback(
    (values: PublishPodFormValues) => {
      const nextProgressId = uuid()
      let submitPromise: Promise<PublishPodSubmitResult>

      setProgressId(nextProgressId)
      setSubmittedValues(values)
      submitCompletedRef.current = false

      try {
        submitPromise = Promise.resolve(
          onSubmitRef.current(values, { progressId: nextProgressId })
        )
      } catch (error) {
        setSubmitStatus({
          state: "error",
          savedPodSlug: null,
          errorMessage: getErrorMessage(error),
        })
        return
      }

      setSubmitStatus({
        state: pendingSubmitState,
        savedPodSlug: null,
        errorMessage: null,
      })
      void submitPromise
        .then((result) => {
          if (pendingSubmitState === "updating") {
            setSubmitStatus({
              state: "success",
              savedPodSlug: result.slug,
              errorMessage: null,
            })
            return
          }
          submitCompletedRef.current = true
          setSubmitStatus((current) => ({
            ...current,
            savedPodSlug: result.slug,
          }))
        })
        .catch((error) => {
          setSubmitStatus({
            state: "error",
            savedPodSlug: null,
            errorMessage: getErrorMessage(error),
          })
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
  const { data: users, isLoading: isUsersLoading } = useQuery(usersQueryOptions)
  const { data: groups, isLoading: isGroupsLoading } =
    useQuery(groupsQueryOptions)
  const {
    data: publishOptions,
    error: publishOptionsError,
    isLoading: isPublishOptionsLoading,
  } = useQuery(publishPodOptionsQueryOptions(publishedPodId))
  const { data: publishProgress } = useQuery(
    publishedPodProgressQueryOptions(
      progressId,
      submitState === "publishing" || submitState === "updating"
    )
  )

  const resolvedSubmitStatus = React.useMemo(() => {
    if (submitState !== "publishing" && submitState !== "updating") {
      return submitStatus
    }

    if (publishProgress?.state === "error") {
      return {
        state: "error" as const,
        savedPodSlug: null,
        errorMessage: publishProgress.message,
      }
    }

    if (submitCompletedRef.current && publishProgress?.state === "success") {
      return {
        state: "success" as const,
        savedPodSlug,
        errorMessage: null,
      }
    }

    return submitStatus
  }, [publishProgress, savedPodSlug, submitState, submitStatus])

  const resolvedSubmitState = resolvedSubmitStatus.state
  const resolvedSavedPodSlug = resolvedSubmitStatus.savedPodSlug
  const resolvedSubmitErrorMessage = resolvedSubmitStatus.errorMessage

  const principalOptions = React.useMemo(
    () => buildPrincipalOptions(users ?? [], groups ?? []),
    [groups, users]
  )
  const isLoadingFormOptions =
    isUsersLoading || isGroupsLoading || isPublishOptionsLoading

  const principalOptionMap = React.useMemo(
    (): Map<string, PrincipalOption> =>
      new Map(principalOptions.map((option) => [option.id, option])),
    [principalOptions]
  )

  const submittedUpdateVirtualMachines = React.useMemo(() => {
    if (!submittedValues) return []

    const selected = new Set(submittedValues.update_virtual_machines)
    if (selected.size === 0) return []

    return submittedValues.virtual_machines.flatMap((vm) =>
      selected.has(vm.id)
        ? [
            {
              id: vm.id,
              name: vm.name,
            },
          ]
        : []
    )
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
    setSubmitStatus({
      state: "form",
      savedPodSlug: null,
      errorMessage: null,
    })
    submitCompletedRef.current = false
  }, [])

  if (resolvedSubmitState !== "form") {
    return (
      <div className="@container/main relative flex flex-1 flex-col">
        <PublishPodSubmitState
          state={resolvedSubmitState}
          errorMessage={resolvedSubmitErrorMessage}
          onBackToForm={handleBackToForm}
          podSlug={resolvedSavedPodSlug}
          progress={
            resolvedSubmitState === "publishing" ||
            resolvedSubmitState === "updating"
              ? publishProgress
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
              publishOptions?.source_folders ??
              ([] satisfies Array<PublishPodFolder>)
            }
            podFoldersError={publishOptionsError}
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
  return error instanceof Error
    ? error.message
    : "Failed to save published pod."
}
