import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PackageCheck,
} from "@hugeicons/core-free-icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
} from "@workspace/ui/components/action-bar"
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
  const currentStep = steps[stepIndex] ?? steps[0]
  const isPublishAction = submitLabel === "Publish"
  const confirmTitle = isPublishAction ? "Publish Pod?" : "Save Changes?"
  const confirmDescription = isPublishAction
    ? "This will full clone the Pod VMs into a Pod Template Folder, convert those clones to Pod Template VMs, and publish the Pod to the catalog."
    : "This will save the latest changes to the published Pod."

  return (
    <>
      <ActionBar
        open
        aria-label="Publish workflow controls"
        className="w-[calc(100%-1rem)] max-w-5xl px-3 sm:w-[calc(100%-2rem)] sm:px-4"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <ActionBarGroup className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-9">
          <StepperPrev
            render={(props) => (
              <ActionBarItem
                size="lg"
                variant="outline"
                {...props}
                onSelect={undefined}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  data-icon="inline-start"
                />
                Previous
              </ActionBarItem>
            )}
          />

          <div className="min-w-0">
            <div className="flex flex-col items-center justify-center gap-1 text-center text-sm sm:hidden">
              <span className="truncate font-medium">{currentStep.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {stepIndex + 1} / {steps.length}
              </span>
            </div>

            <StepperList
              aria-label="Publish progress"
              className="hidden w-full sm:flex"
            >
              {steps.map((s) => (
                <StepperItem
                  key={s.value}
                  value={s.value}
                  aria-current={s.value === step ? "step" : undefined}
                  className="gap-2"
                >
                  <StepperIndicator />
                  <StepperTitle className="hidden lg:block">
                    {s.title}
                  </StepperTitle>
                  <StepperSeparator className="mx-2" />
                </StepperItem>
              ))}
            </StepperList>
          </div>

          {stepIndex === steps.length - 1 ? (
            <ActionBarItem
              type="button"
              size="lg"
              variant="default"
              onClick={() => setPublishConfirmOpen(true)}
            >
              <HugeiconsIcon icon={PackageCheck} data-icon="inline-start" />
              {submitLabel}
            </ActionBarItem>
          ) : (
            <StepperNext
              render={(props) => (
                <ActionBarItem
                  size="lg"
                  variant="default"
                  {...props}
                  onSelect={undefined}
                >
                  Next
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon="inline-end"
                  />
                </ActionBarItem>
              )}
            />
          )}
        </ActionBarGroup>
      </ActionBar>

      <AlertDialog
        open={publishConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPublishConfirmOpen(false)
          }
        }}
      >
        <AppAlertDialogContent
          open={publishConfirmOpen}
          icon={PackageCheck}
          title={confirmTitle}
          description={confirmDescription}
        >
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPublishConfirmOpen(false)}>
              Close
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
