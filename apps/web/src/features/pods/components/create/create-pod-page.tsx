import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { PackageAddIcon } from "@hugeicons/core-free-icons"
import { CreatePodFormSection } from "./create-pod-form-section"
import { useCreatePodForm } from "./create-pod-form"
import { CreatePodPersonalizeSection } from "./create-pod-personalize-section"
import { CreatePodReviewSection } from "./create-pod-review-section"
import { CreatePodVirtualMachinesSection } from "./create-pod-virtual-machines-section"
import { CreatePodSubmitState } from "./create-pod-creation-state"
import { CreatePodFormSkeleton } from "./create-pod-skeleton"
import type { CreatePodFormValues } from "./create-pod-form"
import type { CreatePodResult } from "@/features/pods/api/create-pod-api"
import { uuid } from "@/features/shared/utils/uuid"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import {
  createPod,
  createPodOptionsQueryOptions,
  createPodProgressQueryOptions,
} from "@/features/pods/api/create-pod-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"

type CreatePodFormState = "form" | "creating" | "success" | "error"

type CreatePodPageState = {
  submissionAttempts: number
  submitState: CreatePodFormState
  createConfirmOpen: boolean
  progressId: string | null
  submitErrorMessage: string | null
  createdPod: CreatePodResult | null
}

const initialCreatePodPageState: CreatePodPageState = {
  submissionAttempts: 0,
  submitState: "form",
  createConfirmOpen: false,
  progressId: null,
  submitErrorMessage: null,
  createdPod: null,
}

type CreatePodPageAction =
  | { type: "submitAttempted" }
  | { type: "confirmOpenChanged"; open: boolean }
  | { type: "creationStarted"; progressId: string }
  | { type: "creationSucceeded"; result: CreatePodResult }
  | { type: "creationFailed"; message: string }
  | { type: "validationCrashed" }
  | { type: "reset" }

function createPodPageReducer(
  state: CreatePodPageState,
  action: CreatePodPageAction
): CreatePodPageState {
  switch (action.type) {
    case "submitAttempted":
      return {
        ...state,
        submissionAttempts: state.submissionAttempts + 1,
      }
    case "confirmOpenChanged":
      return { ...state, createConfirmOpen: action.open }
    case "creationStarted":
      return {
        ...state,
        progressId: action.progressId,
        createdPod: null,
        submitErrorMessage: null,
        submitState: "creating",
      }
    case "creationSucceeded":
      return {
        ...state,
        createdPod: action.result,
        submitErrorMessage: null,
        submitState: "success",
      }
    case "creationFailed":
      return {
        ...state,
        submitErrorMessage: action.message,
        submitState: "error",
      }
    case "validationCrashed":
      return { ...state, submitState: "error" }
    case "reset":
      return initialCreatePodPageState
    default:
      return state
  }
}

export function CreatePodPage() {
  const queryClient = useQueryClient()
  const [state, dispatch] = React.useReducer(
    createPodPageReducer,
    initialCreatePodPageState
  )
  const submittedValuesRef = React.useRef<CreatePodFormValues | null>(null)
  const { data: createOptions, isLoading: isCreateOptionsLoading } = useQuery(
    createPodOptionsQueryOptions
  )
  const { data: createProgress } = useQuery(
    createPodProgressQueryOptions(
      state.progressId,
      state.submitState === "creating"
    )
  )
  const createPodMutation = useMutation({
    mutationFn: createPod,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      dispatch({ type: "creationSucceeded", result })
    },
    onError: (error) => {
      dispatch({
        type: "creationFailed",
        message:
          error instanceof Error ? error.message : "Failed to create pod.",
      })
    },
  })
  const handleValidatedSubmit = React.useCallback(
    (values: CreatePodFormValues) => {
      const nextProgressId = uuid()
      submittedValuesRef.current = values
      dispatch({ type: "creationStarted", progressId: nextProgressId })
      createPodMutation.mutate({
        values,
        progressId: nextProgressId,
      })
    },
    [createPodMutation]
  )
  const form = useCreatePodForm({ onSubmit: handleValidatedSubmit })
  const routerTemplateConfigured =
    createOptions?.router_template_configured ?? true

  React.useEffect(() => {
    if (createOptions && !createOptions.router_template_configured) {
      form.setFieldValue("includeRouter", false)
    }
  }, [createOptions, form])
  const latestSubmittedValues = submittedValuesRef.current
  const includeRouter = latestSubmittedValues?.includeRouter ?? false
  const hasSubmittedVirtualMachines =
    latestSubmittedValues?.templates.some(
      (template) => template.vms.length > 0
    ) ?? false
  const resolvedSubmitState =
    state.submitState === "creating" && createProgress?.state === "error"
      ? "error"
      : state.submitState
  const resolvedSubmitErrorMessage =
    createProgress?.state === "error"
      ? createProgress.message
      : state.submitErrorMessage

  const handleReset = React.useCallback(() => {
    submittedValuesRef.current = null
    createPodMutation.reset()
    form.reset()
    dispatch({ type: "reset" })
  }, [createPodMutation, form])

  const validateBeforeConfirm = React.useCallback(async () => {
    dispatch({ type: "submitAttempted" })

    const errors = await form.validate("submit")
    return Object.keys(errors).length === 0
  }, [form])

  const openCreateConfirm = React.useCallback(async () => {
    try {
      const isValid = await validateBeforeConfirm()
      if (isValid) {
        dispatch({ type: "confirmOpenChanged", open: true })
      }
    } catch {
      dispatch({ type: "validationCrashed" })
    }
  }, [validateBeforeConfirm])

  const handleCreateConfirm = React.useCallback(() => {
    dispatch({ type: "confirmOpenChanged", open: false })
    void form.handleSubmit()
  }, [form])

  if (resolvedSubmitState !== "form") {
    return (
      <div className="@container/main flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 lg:px-8">
          <CreatePodSubmitState
            createdPod={state.createdPod}
            errorMessage={resolvedSubmitErrorMessage}
            hasVirtualMachines={hasSubmittedVirtualMachines}
            includeRouter={includeRouter}
            onReset={handleReset}
            progress={
              state.submitState === "creating" ? createProgress : undefined
            }
            state={resolvedSubmitState}
          />
        </div>
      </div>
    )
  }

  if (isCreateOptionsLoading) {
    return <CreatePodFormSkeleton />
  }

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-balance">
            Create Pod
          </h1>
          <p className="text-muted-foreground">
            Initialize a foundation for your pod by using virutal machine
            templates, simplified networking configurations, and more.
          </p>
        </div>
        <form
          className="flex w-full max-w-5xl flex-col"
          action={() => {
            void openCreateConfirm()
          }}
        >
          <CreatePodFormSection number={1} title="Personalize">
            <CreatePodPersonalizeSection
              form={form}
              submissionAttempts={state.submissionAttempts}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={2} title="Virtual Machines">
            <CreatePodVirtualMachinesSection
              form={form}
              submissionAttempts={state.submissionAttempts}
              routerTemplateConfigured={routerTemplateConfigured}
              templateOptions={createOptions?.templates ?? []}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={3} title="Review" isLast>
            <CreatePodReviewSection form={form} />
          </CreatePodFormSection>

          <div className="w-full pt-6">
            <form.Subscribe selector={(formState) => formState.isSubmitting}>
              {(isSubmitting) => (
                <AppActionButton
                  type="submit"
                  pending={isSubmitting}
                  pendingLabel="Creating Pod..."
                  className="w-full"
                  size="lg"
                >
                  <HugeiconsIcon
                    icon={PackageAddIcon}
                    data-icon="inline-start"
                  />
                  Create Pod
                </AppActionButton>
              )}
            </form.Subscribe>
          </div>
        </form>

        <AlertDialog
          open={state.createConfirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              dispatch({ type: "confirmOpenChanged", open: false })
            }
          }}
        >
          <AppAlertDialogContent
            open={state.createConfirmOpen}
            icon={PackageAddIcon}
            title="Create Pod?"
            description="This will create the Pod inventory folder, assign its permissions, and begin preparing the router and selected virtual machine templates."
          >
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() =>
                  dispatch({ type: "confirmOpenChanged", open: false })
                }
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="default"
                onClick={handleCreateConfirm}
              >
                Create Pod
              </AlertDialogAction>
            </AlertDialogFooter>
          </AppAlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
