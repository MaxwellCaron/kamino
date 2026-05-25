import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react"
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
  StepperTrigger,
} from "@workspace/ui/components/stepper"

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
  step: PublishPodStep
}

export function PublishPodStepper({ step }: PublishPodStepperProps) {
  const stepIndex = steps.findIndex((s) => s.value === step)

  return (
    <div className="sticky bottom-6 z-50 mx-auto w-full max-w-500 px-2 lg:px-6">
      <Card className="bg-muted">
        <CardContent className="space-y-6">
          <StepperList className="w-full">
            {steps.map((s) => (
              <StepperItem key={s.value} value={s.value}>
                <StepperTrigger>
                  <StepperIndicator className="bg-card" />
                  <div className="flex flex-col gap-px">
                    <StepperTitle className="hidden md:block">
                      {s.title}
                    </StepperTitle>
                  </div>
                </StepperTrigger>
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
              <Button type="submit">Complete</Button>
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
  )
}
