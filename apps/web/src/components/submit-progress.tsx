import { useEffect, useRef, useState } from "react"
import { Loader } from "@dot-loaders/react"
import { Link } from "@tanstack/react-router"
import { IconCircleCheckFilled, IconCircleXFilled } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ComponentType, MouseEventHandler } from "react"
import { getCloneStepColors } from "@/features/pods/types/clone-status"

export type PodSubmitProgressStep<TStepId extends number = number> = {
  id: TStepId
  title: string
  description: string
}

export type PodSubmitProgressSteps<TStepId extends number = number> = readonly [
  PodSubmitProgressStep<TStepId>,
  ...Array<PodSubmitProgressStep<TStepId>>,
]

export type PodSubmitAction = {
  icon: ComponentType<{ className?: string; "data-icon"?: string }>
  label: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  to: ComponentProps<typeof Link>["to"]
  variant?: "default" | "secondary"
}

type PodSubmitProgressStateProps<TStepId extends number> = {
  intervalMs: number
  onComplete?: () => void
  stepId?: TStepId
  steps: PodSubmitProgressSteps<TStepId>
  title: string
}

export function PodSubmitProgressState<TStepId extends number>({
  intervalMs,
  onComplete,
  stepId,
  steps,
  title,
}: PodSubmitProgressStateProps<TStepId>) {
  const [simulatedStepIndex, setSimulatedStepIndex] = useState(0)
  const hasCompletedRef = useRef(false)
  const externalStepIndex =
    stepId === undefined ? -1 : steps.findIndex((step) => step.id === stepId)
  const currentStepIndex =
    externalStepIndex >= 0 ? externalStepIndex : simulatedStepIndex
  const currentStep = steps[currentStepIndex]
  const colors = getCloneStepColors(currentStep.id)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  useEffect(() => {
    if (stepId !== undefined) return

    const timer = window.setTimeout(() => {
      if (simulatedStepIndex === steps.length - 1) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true
          onComplete?.()
        }

        return
      }

      setSimulatedStepIndex((index) => index + 1)
    }, intervalMs)

    return () => window.clearTimeout(timer)
  }, [intervalMs, onComplete, simulatedStepIndex, stepId, steps.length])

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <span
            className={cn(
              "flex items-center transition-colors duration-500",
              colors.text
            )}
          >
            <Loader
              loader="braille"
              renderer="svg-grid"
              speed={0.85}
              rendererOptions={{
                shape: "square",
                cellSize: 6,
                gap: 2,
              }}
            />
          </span>
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Progress
          value={progress}
          className="w-full **:h-1.5"
          indicatorClassName={cn("transition-all duration-500", colors.bg)}
        />
        <div
          className="flex w-md flex-col items-center gap-1"
          aria-live="polite"
        >
          <span
            className={cn(
              "font-medium transition-colors duration-500",
              colors.text
            )}
          >
            {currentStep.title} ({currentStepIndex + 1} / {steps.length})
          </span>
          <span className="text-muted-foreground">
            {currentStep.description}
          </span>
        </div>
      </EmptyContent>
    </Empty>
  )
}

export function PodSubmitLoadingState({
  description,
  intervalMs,
  onComplete,
  title,
}: {
  description: string
  intervalMs: number
  onComplete?: () => void
  title: string
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onComplete?.()
    }, intervalMs)

    return () => window.clearTimeout(timer)
  }, [intervalMs, onComplete])

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <span className="flex items-center text-primary">
            <Loader
              loader="braille"
              renderer="svg-grid"
              speed={0.85}
              rendererOptions={{
                shape: "square",
                cellSize: 6,
                gap: 2,
              }}
            />
          </span>
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function PodSubmitActions({ actions }: { actions: Array<PodSubmitAction> }) {
  return (
    <EmptyContent className="flex-row justify-center gap-3">
      {actions.map((action) => {
        const Icon = action.icon

        return (
          <Link
            key={`${action.to}-${action.label}`}
            to={action.to}
            onClick={action.onClick}
            className={`${buttonVariants({
              variant: action.variant ?? "default",
            })} cursor-default`}
          >
            <Icon data-icon="inline-start" />
            {action.label}
          </Link>
        )
      })}
    </EmptyContent>
  )
}

export function PodSubmitSuccessState({
  actions,
  description,
  title,
}: {
  actions: Array<PodSubmitAction>
  description: string
  title: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <IconCircleCheckFilled className="size-7 text-primary" />
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <PodSubmitActions actions={actions} />
    </Empty>
  )
}

export function PodSubmitErrorState({
  actions,
  description,
  title,
}: {
  actions: Array<PodSubmitAction>
  description: string
  title: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <IconCircleXFilled className="size-7 text-destructive" />
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <PodSubmitActions actions={actions} />
    </Empty>
  )
}
