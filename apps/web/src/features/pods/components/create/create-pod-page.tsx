import React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { IconCubePlus } from "@tabler/icons-react"
import { CreatePodFormSection } from "./create-pod-form-section"
import { useCreatePodForm } from "./create-pod-form"
import { CreatePodPersonalizeSection } from "./create-pod-personalize-section"
import { CreatePodReviewSection } from "./create-pod-review-section"
import { CreatePodVirtualMachinesSection } from "./create-pod-virtual-machines-section"
import { CreatePodSubmitState } from "./create-pod-creation-state"
import type { CreatePodFormValues } from "./create-pod-form"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

type CreatePodFormState = "form" | "creating" | "success" | "error"

function createPodForStaticTest(values: CreatePodFormValues) {
  if (values.name.trim().toLowerCase() === "error") {
    throw new Error("Static create pod failure.")
  }
}

export function CreatePodPage() {
  const [submissionAttempts, setSubmissionAttempts] = React.useState(0)
  const [submitState, setSubmitState] =
    React.useState<CreatePodFormState>("form")
  const [createConfirmOpen, setCreateConfirmOpen] = React.useState(false)
  const submittedValuesRef = React.useRef<CreatePodFormValues | null>(null)
  const handleValidatedSubmit = React.useCallback(
    (values: CreatePodFormValues) => {
      submittedValuesRef.current = values
      setSubmitState("creating")
    },
    []
  )
  const form = useCreatePodForm({ onSubmit: handleValidatedSubmit })
  const latestSubmittedValues = submittedValuesRef.current
  const hasSubmittedVirtualMachines =
    latestSubmittedValues?.includeRouter ||
    latestSubmittedValues?.templates.some(
      (template) => template.vms.length > 0
    ) ||
    false

  const handleCreatingComplete = React.useCallback(() => {
    const submittedValues = submittedValuesRef.current

    if (!submittedValues) {
      setSubmitState("error")
      return
    }

    try {
      createPodForStaticTest(submittedValues)
      setSubmitState("success")
    } catch {
      setSubmitState("error")
    }
  }, [])

  const handleReset = React.useCallback(() => {
    submittedValuesRef.current = null
    setSubmissionAttempts(0)
    form.reset()
    setSubmitState("form")
  }, [form])

  const handleCreateConfirm = React.useCallback(() => {
    setCreateConfirmOpen(false)
    setSubmissionAttempts((attempts) => attempts + 1)
    void form.handleSubmit()
  }, [form])

  if (submitState !== "form") {
    return (
      <div className="@container/main flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 lg:px-8">
          <CreatePodSubmitState
            hasVirtualMachines={hasSubmittedVirtualMachines}
            onCreatingComplete={handleCreatingComplete}
            onReset={handleReset}
            state={submitState}
          />
        </div>
      </div>
    )
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
          onSubmit={(event) => {
            event.preventDefault()
            setCreateConfirmOpen(true)
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
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={3} title="Review" isLast>
            <CreatePodReviewSection form={form} />
          </CreatePodFormSection>

          <div className="w-full pt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                  size="lg"
                >
                  <IconCubePlus data-icon="inline-start" />
                  {isSubmitting ? "Creating Pod..." : "Create Pod"}
                </Button>
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
