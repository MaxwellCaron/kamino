import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import {
  createInitialPublishPodValues,
  usePublishPodForm,
} from "./publish-pod-form"
import { defaultPublishPodStep } from "./publish-pod-steps"
import { PublishPodSubmitState } from "./publish-pod-publishing-state"
import { PublishPodFormView } from "./publish-pod-form-view"
import { validateFormForSubmit, validateStep } from "./publish-pod-validation"
import type { PublishPodStep } from "./publish-pod-steps"
import type { PublishPodFormValues } from "./publish-pod-form"
import type { PublishPodSubmitStatus } from "./publish-pod-submit-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"
import { uuid } from "@/features/shared/utils/uuid"
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
  const submissionAttempts = useSelector(
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

  const submitForm = React.useCallback(async () => {
    const isValid = await validateFormForSubmit(form, setStep)
    if (!isValid) {
      return false
    }

    await form.handleSubmit()
    return true
  }, [form])

  const handleBackToForm = React.useCallback(() => {
    setSubmitStatus({
      state: "form",
      savedPodSlug: null,
      errorMessage: null,
    })
    submitCompletedRef.current = false
  }, [])

  const handleValidateStep = React.useCallback(
    () => validateStep(form, step),
    [form, step]
  )

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
    <PublishPodFormView
      step={step}
      onStepChange={setStep}
      onValidateStep={handleValidateStep}
      form={form}
      principalOptionMap={principalOptionMap}
      principalOptions={principalOptions}
      submissionAttempts={submissionAttempts}
      publishedPodId={publishedPodId}
      podFolders={
        publishOptions?.source_folders ?? ([] satisfies Array<PublishPodFolder>)
      }
      podFoldersError={publishOptionsError}
      submitLabel={submitLabel}
      onSubmitConfirm={submitForm}
    />
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Failed to save published pod."
}
