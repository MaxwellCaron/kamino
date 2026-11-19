import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  COMPLETE_PROGRESS_COLORS,
  DEFAULT_PROGRESS_COLORS,
  FAILED_PROGRESS_COLORS,
  getProgressStepColors,
} from "@/lib/pods/progress-state/progress-state-colors"
import {
  CancelCircleIcon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import type {
  ProgressStateAction,
  ProgressStateSteps,
} from "@/lib/pods/progress-state/progress-state-types"
import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { Progress } from "@workspace/ui/components/progress"
import type { ReactNode } from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useScrollToTopOnMount } from "@/hooks/scroll/use-scroll-to-top-on-mount"

type ProgressStateProps<TStepId extends number> = {
  children?: ReactNode
  detail?: string
  intervalMs?: number
  onComplete?: () => void
  progressValue?: number
  stepId?: TStepId
  steps: ProgressStateSteps<TStepId>
  title: string
}

export function ProgressState<TStepId extends number>({
  children,
  detail,
  intervalMs,
  onComplete,
  progressValue,
  stepId,
  steps,
  title,
}: ProgressStateProps<TStepId>) {
  useScrollToTopOnMount()
  const [simulatedStepIndex, setSimulatedStepIndex] = useState(0)
  const hasCompletedRef = useRef(false)
  const externalStepIndex =
    stepId === undefined ? -1 : steps.findIndex((step) => step.id === stepId)
  const currentStepIndex =
    externalStepIndex >= 0 ? externalStepIndex : simulatedStepIndex
  const currentStep = steps[currentStepIndex]
  const colors = getProgressStepColors(currentStep.id)
  const progress =
    progressValue === undefined
      ? ((currentStepIndex + 1) / steps.length) * 100
      : Math.min(Math.max(progressValue, 0), 100)

  useEffect(() => {
    if (stepId !== undefined) return
    if (intervalMs === undefined) return

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
    <Empty role="status">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <span
            className={cn(
              "flex items-center transition-colors duration-500",
              colors.text
            )}
          >
            <Spinner className="size-7" />
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
            {detail ?? currentStep.description}
          </span>
        </div>
        {children}
      </EmptyContent>
    </Empty>
  )
}

export function ProgressLoadingState({
  description,
  intervalMs,
  onComplete,
  title,
}: {
  description: string
  intervalMs?: number
  onComplete?: () => void
  title: string
}) {
  useScrollToTopOnMount()

  useEffect(() => {
    if (intervalMs === undefined) return

    const timer = window.setTimeout(() => {
      onComplete?.()
    }, intervalMs)

    return () => window.clearTimeout(timer)
  }, [intervalMs, onComplete])

  return (
    <Empty role="status">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <span
            className={cn("flex items-center", DEFAULT_PROGRESS_COLORS.text)}
          >
            <Spinner className="size-7" />
          </span>
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ProgressStateActions({
  actions,
}: {
  actions: Array<ProgressStateAction>
}) {
  return (
    <EmptyContent className="flex-row justify-center gap-3">
      {actions.map((action) => {
        const Icon = action.icon
        const className = `${buttonVariants({
          variant: action.variant ?? "default",
        })} cursor-pointer`

        if (!("to" in action)) {
          return (
            <Button
              key={action.label}
              type="button"
              variant={action.variant ?? "default"}
              onClick={action.onClick}
            >
              <HugeiconsIcon icon={Icon} data-icon="inline-start" />
              {action.label}
            </Button>
          )
        }

        if (action.to === "/pods/$podSlug") {
          return (
            <Link
              key={`${action.to}-${action.label}`}
              to="/pods/$podSlug"
              params={action.params}
              onClick={action.onClick}
              className={className}
            >
              <HugeiconsIcon icon={Icon} data-icon="inline-start" />
              {action.label}
            </Link>
          )
        }

        if (action.to === "/inventory/items/$itemId") {
          return (
            <Link
              key={`${action.to}-${action.label}`}
              to="/inventory/items/$itemId"
              params={action.params}
              onClick={action.onClick}
              className={className}
            >
              <HugeiconsIcon icon={Icon} data-icon="inline-start" />
              {action.label}
            </Link>
          )
        }

        return (
          <Link
            key={`${action.to}-${action.label}`}
            to={action.to}
            onClick={action.onClick}
            className={className}
          >
            <HugeiconsIcon icon={Icon} data-icon="inline-start" />
            {action.label}
          </Link>
        )
      })}
    </EmptyContent>
  )
}

export function ProgressSuccessState({
  actions,
  description,
  title,
}: {
  actions: Array<ProgressStateAction>
  description: string
  title: string
}) {
  return (
    <Empty role="status">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            className={cn("size-7", COMPLETE_PROGRESS_COLORS.text)}
          />
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <ProgressStateActions actions={actions} />
    </Empty>
  )
}

export function ProgressErrorState({
  actions,
  description,
  title,
}: {
  actions: Array<ProgressStateAction>
  description: string
  title: string
}) {
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <HugeiconsIcon
            icon={CancelCircleIcon}
            className={cn("size-7", FAILED_PROGRESS_COLORS.text)}
          />
        </EmptyMedia>
        <EmptyTitle className="pt-3">{title}</EmptyTitle>
        <EmptyDescription className="first-letter:uppercase">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      <ProgressStateActions actions={actions} />
    </Empty>
  )
}
