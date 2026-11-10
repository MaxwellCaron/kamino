import * as React from "react"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/lib/principals/principals-api"
import {
  publishPodOptionsQueryOptions,
  publishedPodProgressQueryOptions,
} from "@/lib/pods/publish-pod-api"
import {
  validateFormForSubmit,
  validateStep,
} from "@/lib/pods/publish/publish-pod-validation"
import type { PrincipalOption } from "@/lib/inventory/inventory-types"
import type { PublishPodFolder } from "@/lib/pods/publish-pod-api"
import type { PublishPodFormValues } from "@/lib/pods/publish/publish-pod-form"
import { PublishPodFormView } from "@/components/pods/publish/publish-pod-form-view"
import type { PublishPodStep } from "@/lib/pods/publish/publish-pod-steps"
import { PublishPodSubmitState } from "@/components/pods/publish/publish-pod-publishing-state"
import type { PublishPodSubmitStatus } from "@/lib/pods/publish/publish-pod-submit-types"
import { buildPrincipalOptions } from "@/lib/inventory/acl-transformers"
import { createInitialPublishPodValues } from "@/lib/pods/publish/publish-pod-form"
import { defaultPublishPodStep } from "@/lib/pods/publish/publish-pod-steps"
import { usePublishPodForm } from "@/hooks/pods/use-publish-pod-form"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import { uuid } from "@/lib/uuid"

type PublishPodPendingStatus = Extract<
  PublishPodSubmitStatus,
  "publishing" | "updating"
>
type PublishPodSubmitState =
  | { state: "form" | PublishPodPendingStatus; savedPodSlug: null; error: null }
  | { state: "success"; savedPodSlug: string; error: null }
  | { state: "error"; savedPodSlug: null; error: string }
type PublishPodSubmitOptions = {
  progressId: string
}
type PublishPodSubmitResult = {
  slug: string
}
type PublishPodSubmission = {
  progressId: string
  values: PublishPodFormValues
}

type PublishPodEditorProps = {
  initialValues?: PublishPodFormValues
  publishedPodId?: string
  onSubmit: (
    values: PublishPodFormValues,
    options: PublishPodSubmitOptions
  ) => Promise<PublishPodSubmitResult> | PublishPodSubmitResult
  pendingSubmitState?: PublishPodPendingStatus
  submitLabel?: string
}

export function PublishPodEditor({
  initialValues,
  publishedPodId,
  onSubmit,
  pendingSubmitState = "publishing",
  submitLabel,
}: PublishPodEditorProps) {
  const [step, setStep] = React.useState<PublishPodStep>(defaultPublishPodStep)
  const [submitStatus, setSubmitStatus] = React.useState<PublishPodSubmitState>(
    {
      state: "form",
      savedPodSlug: null,
      error: null,
    }
  )
  const [submission, setSubmission] =
    React.useState<PublishPodSubmission | null>(null)
  const onSubmitRef = React.useRef(onSubmit)
  const submitState = submitStatus.state
  const savedPodSlug = submitStatus.savedPodSlug
  const progressId = submission?.progressId ?? null
  const submittedValues = submission?.values ?? null
  const defaultValues = React.useMemo(
    () => initialValues ?? createInitialPublishPodValues(),
    [initialValues]
  )

  React.useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  const handleValidatedSubmit = React.useCallback(
    async (values: PublishPodFormValues) => {
      const nextProgressId = uuid()
      setSubmission({ progressId: nextProgressId, values })
      setSubmitStatus({
        state: pendingSubmitState,
        savedPodSlug: null,
        error: null,
      })

      try {
        const result = await onSubmitRef.current(values, {
          progressId: nextProgressId,
        })
        setSubmitStatus({
          state: "success",
          savedPodSlug: result.slug,
          error: null,
        })
      } catch (error) {
        setSubmitStatus({
          state: "error",
          savedPodSlug: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to save published pod.",
        })
      }
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
  const isDefaultValue = useSelector(
    form.store,
    (state) => state.isDefaultValue
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

  const hasUnsavedChanges =
    !isDefaultValue && (submitState === "form" || submitState === "error")
  useUnsavedChangesWarning(hasUnsavedChanges)

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
      error: null,
    })
    setSubmission(null)
  }, [])

  const handleValidateStep = React.useCallback(
    () => validateStep(form, step),
    [form, step]
  )

  if (submitState !== "form") {
    return (
      <div className="@container/main relative flex flex-1 flex-col">
        <PublishPodSubmitState
          state={submitState}
          error={submitStatus.error}
          onBackToForm={handleBackToForm}
          podSlug={savedPodSlug}
          progress={
            submitState === "publishing" || submitState === "updating"
              ? publishProgress
              : undefined
          }
          updateVirtualMachines={submittedUpdateVirtualMachines}
        />
      </div>
    )
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col">
      {!isLoadingFormOptions && (
        <form
          noValidate
          className="@container/main relative flex flex-1 flex-col pb-28"
          action={() => {
            void submitForm()
          }}
        >
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
              publishOptions?.source_folders ??
              ([] satisfies Array<PublishPodFolder>)
            }
            podFoldersError={publishOptionsError}
            cloneTargets={publishOptions?.clone_targets ?? []}
            submitLabel={submitLabel}
            onSubmitConfirm={submitForm}
          />
        </form>
      )}
    </div>
  )
}
