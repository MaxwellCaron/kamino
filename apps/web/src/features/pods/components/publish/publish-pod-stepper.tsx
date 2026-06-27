import { useState } from "react"
import {
  IconArrowLeft,
  IconArrowRight,
  IconCubeSend,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperNext,
  StepperPrev,
  StepperSeparator,
  StepperTitle,
} from "@workspace/ui/components/stepper"
import { steps } from "./publish-pod-steps"
import type { PublishPodStep } from "./publish-pod-steps"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

type PublishPodStepperProps = {
  onSubmitConfirm: () => Promise<boolean> | boolean
  step: PublishPodStep
  submitLabel?: string
}

export function PublishPodStepper({
  onSubmitConfirm,
  step,
  submitLabel = "Publish",
}: PublishPodStepperProps) {
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const stepIndex = steps.findIndex((s) => s.value === step)
  const isPublishAction = submitLabel === "Publish"
  const confirmTitle = isPublishAction ? "Publish Pod?" : "Save Changes?"
  const confirmDescription = isPublishAction
    ? "This will full clone the Pod VMs into a Pod Template Folder, convert those clones to Pod Template VMs, and publish the Pod to the catalog."
    : "This will save the latest changes to the published Pod."

  return (
    <>
      <div className="sticky bottom-6 z-50 mx-auto w-full max-w-500 px-2 lg:px-6">
        <Card className="bg-muted">
          <CardContent className="cursor-pointer space-y-6">
            <StepperList className="w-full">
              {steps.map((s) => (
                <StepperItem key={s.value} value={s.value} className="gap-2">
                  <StepperIndicator className="bg-card" />
                  <div className="flex flex-col gap-px">
                    <StepperTitle className="hidden md:block">
                      {s.title}
                    </StepperTitle>
                  </div>
                  <StepperSeparator className="mx-4" />
                </StepperItem>
              ))}
            </StepperList>
            <div className="flex items-center justify-between">
              <StepperPrev
                render={(props) => (
                  <Button variant="outline" {...props}>
                    <IconArrowLeft data-icon="inline-start" />
                    Previous
                  </Button>
                )}
              />
              <div className="text-sm font-medium text-muted-foreground">
                Step {stepIndex + 1} of {steps.length}
              </div>
              {stepIndex === steps.length - 1 ? (
                <Button
                  type="button"
                  onClick={() => setPublishConfirmOpen(true)}
                >
                  <IconCubeSend data-icon="inline-start" />
                  {submitLabel}
                </Button>
              ) : (
                <StepperNext
                  render={(props) => (
                    <Button {...props}>
                      Next
                      <IconArrowRight data-icon="inline-end" />
                    </Button>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={publishConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPublishConfirmOpen(false)
          }
        }}
      >
        <AppAlertDialogContent
          open={publishConfirmOpen}
          icon={IconCubeSend}
          title={confirmTitle}
          description={confirmDescription}
        >
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isSubmitting}
              onClick={() => setPublishConfirmOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AppActionButton
              type="button"
              variant="default"
              pending={isSubmitting}
              pendingLabel={isPublishAction ? "Publishing..." : "Saving..."}
              onClick={async (event) => {
                event.preventDefault()
                setIsSubmitting(true)
                try {
                  const submitted = await onSubmitConfirm()
                  if (submitted) {
                    setPublishConfirmOpen(false)
                  }
                } finally {
                  setIsSubmitting(false)
                }
              }}
            >
              {submitLabel}
            </AppActionButton>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  )
}
