import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  StepperDescription,
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
    description: "Title, description, and image",
    fields: ["title", "description", "image", "vms_visible"] as const,
  },
  {
    value: "tasks",
    title: "Tasks",
    description: "Add tasks and questions",
    fields: ["tasks"] as const,
  },
  {
    value: "preview",
    title: "Preview",
    description: "Review your pod",
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
    <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-4xl -translate-x-1/2 px-2">
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
                    <StepperDescription className="hidden md:block">
                      {s.description}
                    </StepperDescription>
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
