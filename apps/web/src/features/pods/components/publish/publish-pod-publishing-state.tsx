import { useEffect, useRef, useState } from "react"
import { Loader } from "@dot-loaders/react"
import {
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconListDetails,
  IconPackage,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
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
import { getCloneStepColors } from "@/features/pods/types/clone-status"

export const PUBLISH_POD_STEP_IDS = [1, 2, 3, 4] as const
export const PUBLISH_POD_STEP_COUNT = PUBLISH_POD_STEP_IDS.length
export const PUBLISH_POD_STEP_INTERVAL_MS = 2_000
export const UPDATE_POD_INTERVAL_MS = 2_000

export type PublishPodStepId = (typeof PUBLISH_POD_STEP_IDS)[number]
export type PublishPodSubmitStatus =
  | "publishing"
  | "updating"
  | "success"
  | "error"

const PUBLISH_POD_STEPS = {
  1: {
    title: "Fetching VMs",
    description: "Finding the source virtual machines selected for this Pod.",
  },
  2: {
    title: "Creating Pod Folders",
    description: "Preparing the folder structure for the published Pod.",
  },
  3: {
    title: "Cloning source VMs",
    description: "Copying source virtual machines into the publish workspace.",
  },
  4: {
    title: "Converting VMs to templates",
    description: "Marking cloned virtual machines as reusable templates.",
  },
} satisfies Record<PublishPodStepId, { title: string; description: string }>

function getNextPublishStepId(stepId: PublishPodStepId): PublishPodStepId {
  switch (stepId) {
    case 1:
      return 2
    case 2:
      return 3
    case 3:
      return 4
    case 4:
      return 4
  }
}

function PublishingState({
  onPublishingComplete,
  publishingStepId,
}: {
  onPublishingComplete?: () => void
  publishingStepId?: PublishPodStepId
}) {
  const [simulatedStepId, setSimulatedStepId] = useState<PublishPodStepId>(1)
  const hasCompletedRef = useRef(false)
  const currentStepId = publishingStepId ?? simulatedStepId
  const currentStep = PUBLISH_POD_STEPS[currentStepId]
  const colors = getCloneStepColors(currentStepId)
  const progress = (currentStepId / PUBLISH_POD_STEP_COUNT) * 100

  useEffect(() => {
    if (publishingStepId) return

    const timer = window.setTimeout(() => {
      if (simulatedStepId === PUBLISH_POD_STEP_COUNT) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true
          onPublishingComplete?.()
        }

        return
      }

      setSimulatedStepId(getNextPublishStepId)
    }, PUBLISH_POD_STEP_INTERVAL_MS)

    return () => window.clearTimeout(timer)
  }, [onPublishingComplete, publishingStepId, simulatedStepId])

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
        <EmptyTitle className="pt-3">Publishing</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Progress
          value={progress}
          className="w-full **:h-1.5"
          indicatorClassName={cn("transition-all duration-500", colors.bg)}
        />
        <div className="flex flex-col items-center gap-1" aria-live="polite">
          <span
            className={cn(
              "font-medium transition-colors duration-500",
              colors.text
            )}
          >
            {currentStep.title} ({currentStepId} / {PUBLISH_POD_STEP_COUNT})
          </span>
          <span className="text-muted-foreground">
            {currentStep.description}
          </span>
        </div>
      </EmptyContent>
    </Empty>
  )
}

function UpdatingState({
  onUpdatingComplete,
}: {
  onUpdatingComplete?: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onUpdatingComplete?.()
    }, UPDATE_POD_INTERVAL_MS)

    return () => window.clearTimeout(timer)
  }, [onUpdatingComplete])

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
        <EmptyTitle className="pt-3">Updating</EmptyTitle>
        <EmptyDescription>
          Saving the latest changes to this Pod.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function SuccessState() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <IconCircleCheckFilled className="size-7 text-primary" />
        </EmptyMedia>
        <EmptyTitle className="pt-3">Published</EmptyTitle>
        <EmptyDescription>
          Your Pod has been successfully published. View it in the catalog or go
          directly to its page.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-3">
        <Link
          to="/pods/published"
          className={`${buttonVariants({ variant: "secondary" })} cursor-default`}
        >
          <IconListDetails data-icon="inline-start" />
          View Catalog
        </Link>
        <Link
          to="/pods/publish"
          className={`${buttonVariants()} cursor-default`}
        >
          <IconPackage data-icon="inline-start" />
          View Pod
        </Link>
      </EmptyContent>
    </Empty>
  )
}

function ErrorState() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12.5">
          <IconCircleXFilled className="size-7 text-destructive" />
        </EmptyMedia>
        <EmptyTitle className="pt-3">Publishing Failed</EmptyTitle>
        <EmptyDescription>
          Your Pod failed to publish. Please try again or contact support if the
          issue persists.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-3">
        <Link
          to="/pods/published"
          className={`${buttonVariants({ variant: "secondary" })} cursor-default`}
        >
          <IconListDetails data-icon="inline-start" />
          View Catalog
        </Link>
      </EmptyContent>
    </Empty>
  )
}

export function PublishPodSubmitState({
  onPublishingComplete,
  state,
  publishingStepId,
}: {
  onPublishingComplete?: () => void
  state: PublishPodSubmitStatus
  publishingStepId?: PublishPodStepId
}) {
  switch (state) {
    case "publishing":
      return (
        <PublishingState
          onPublishingComplete={onPublishingComplete}
          publishingStepId={publishingStepId}
        />
      )
    case "updating":
      return <UpdatingState onUpdatingComplete={onPublishingComplete} />
    case "success":
      return <SuccessState />
    case "error":
      return <ErrorState />
  }
}
