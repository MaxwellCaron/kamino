import { useState } from "react"
import {
  IconArrowLeft,
  IconArrowRight,
  IconCubeSend,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
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
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

export const steps = [
  {
    value: "personalize",
    title: "Personalize",
    fields: ["title", "description", "image", "creators"] as const,
  },
  {
    value: "access",
    title: "Access",
    fields: ["status", "audience"] as const,
  },
  {
    value: "virtual-machines",
    title: "VMs",
    fields: ["source_folder"] as const,
  },
  {
    value: "tasks",
    title: "Tasks",
    fields: ["tasks"] as const,
  },
  {
    value: "preview",
    title: "Preview",
    fields: [] as const,
  },
]

export type PublishPodStep = (typeof steps)[number]["value"]

export const defaultPublishPodStep: PublishPodStep = steps[0].value

type PublishPodStepperProps = {
  onSubmitConfirm: () => Promise<void> | void
  step: PublishPodStep
  submitLabel?: string
}

export function PublishPodStepper({
  onSubmitConfirm,
  step,
  submitLabel = "Publish",
}: PublishPodStepperProps) {
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const stepIndex = steps.findIndex((s) => s.value === step)
  const isPublishAction = submitLabel === "Publish"
  const confirmTitle = isPublishAction ? "Publish Pod?" : "Save Changes?"
  const confirmDescription = isPublishAction
    ? "This will publish the Pod to the catalog and begin preparing its virtual machine templates."
    : "This will save the latest changes to the published Pod."

  return (
    <>
      <div className="sticky bottom-6 z-50 mx-auto w-full max-w-500 px-2 lg:px-6">
        <Card className="bg-muted">
          <CardContent className="cursor-default space-y-6">
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
          if (!open) {
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
            <AlertDialogCancel onClick={() => setPublishConfirmOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              onClick={() => {
                setPublishConfirmOpen(false)
                void onSubmitConfirm()
              }}
            >
              {submitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  )
}
