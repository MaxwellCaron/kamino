import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { IconCubePlus } from "@tabler/icons-react"
import { CreatePodFormSection } from "./create-pod-form-section"
import { useCreatePodForm } from "./create-pod-form"
import { CreatePodPersonalizeSection } from "./create-pod-personalize-section"
import { CreatePodReviewSection } from "./create-pod-review-section"
import { CreatePodVirtualMachinesSection } from "./create-pod-virtual-machines-section"
import { CreatePodSubmitState } from "./create-pod-creation-state"
import { CreatePodFormSkeleton } from "./create-pod-skeleton"
import type { CreatePodFormValues } from "./create-pod-form"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import {
  createPod,
  createPodOptionsQueryOptions,
} from "@/features/pods/api/create-pod-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"

type CreatePodFormState = "form" | "creating" | "success" | "error"

export function CreatePodPage() {
  const queryClient = useQueryClient()
  const [submissionAttempts, setSubmissionAttempts] = React.useState(0)
  const [submitState, setSubmitState] =
    React.useState<CreatePodFormState>("form")
  const [createConfirmOpen, setCreateConfirmOpen] = React.useState(false)
  const submittedValuesRef = React.useRef<CreatePodFormValues | null>(null)
  const { data: createOptions, isLoading: isCreateOptionsLoading } = useQuery(
    createPodOptionsQueryOptions
  )
  const createPodMutation = useMutation({
    mutationFn: createPod,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      setSubmitState("success")
    },
    onError: () => {
      setSubmitState("error")
    },
  })
  const handleValidatedSubmit = React.useCallback(
    (values: CreatePodFormValues) => {
      submittedValuesRef.current = values
      setSubmitState("creating")
      createPodMutation.mutate(values)
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
  const hasSubmittedVirtualMachines =
    latestSubmittedValues?.includeRouter ||
    latestSubmittedValues?.templates.some(
      (template) => template.vms.length > 0
    ) ||
    false

  const handleReset = React.useCallback(() => {
    submittedValuesRef.current = null
    setSubmissionAttempts(0)
    createPodMutation.reset()
    form.reset()
    setSubmitState("form")
  }, [createPodMutation, form])

  const validateBeforeConfirm = React.useCallback(async () => {
    setSubmissionAttempts((attempts) => attempts + 1)

    const errors = await form.validate("submit")
    return Object.keys(errors).length === 0
  }, [form])

  const openCreateConfirm = React.useCallback(async () => {
    try {
      const isValid = await validateBeforeConfirm()
      if (isValid) {
        setCreateConfirmOpen(true)
      }
    } catch {
      setSubmitState("error")
    }
  }, [validateBeforeConfirm])

  const handleCreateConfirm = React.useCallback(() => {
    setCreateConfirmOpen(false)
    void form.handleSubmit()
  }, [form])

  if (submitState !== "form") {
    return (
      <div className="@container/main flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 lg:px-8">
          <CreatePodSubmitState
            hasVirtualMachines={hasSubmittedVirtualMachines}
            onReset={handleReset}
            state={submitState}
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
          <h1 className="text-4xl font-extrabold tracking-tight text-balance">
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
              submissionAttempts={submissionAttempts}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={2} title="Virtual Machines">
            <CreatePodVirtualMachinesSection
              form={form}
              submissionAttempts={submissionAttempts}
              routerTemplateConfigured={routerTemplateConfigured}
              templateOptions={createOptions?.templates ?? []}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={3} title="Review" isLast>
            <CreatePodReviewSection form={form} />
          </CreatePodFormSection>

          <div className="w-full pt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <AppActionButton
                  type="submit"
                  pending={isSubmitting}
                  pendingLabel="Creating Pod..."
                  className="w-full"
                  size="lg"
                >
                  <IconCubePlus data-icon="inline-start" />
                  Create Pod
                </AppActionButton>
              )}
            </form.Subscribe>
          </div>
        </form>

        <AlertDialog
          open={createConfirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCreateConfirmOpen(false)
            }
          }}
        >
          <AppAlertDialogContent
            open={createConfirmOpen}
            icon={IconCubePlus}
            title="Create Pod?"
            description="This will create the Pod inventory folder, assign its permissions, and begin preparing the router and selected virtual machine templates."
          >
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCreateConfirmOpen(false)}>
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
