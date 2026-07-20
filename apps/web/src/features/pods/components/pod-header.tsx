import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
} from "@workspace/ui/components/circular-progress"
import { Image } from "@unpic/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { cn } from "@workspace/ui/lib/utils"
import { ClonedPodStatusHoverCard } from "./cloned-pod-status-badge"
import { PodHeaderActions } from "./pod-header-actions"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import type { ReactNode } from "react"
import {
  FormatPodCreators,
  PodCreatorIcon,
} from "@/features/pods/components/pod-creators"
import { createTaskSummary } from "@/features/pods/utils/pod-runtime-state"
import { GrainientBackground } from "@/components/grainient-background"

function PodHeaderMetaChip({
  icon,
  value,
  label,
  className,
}: {
  icon?: ReactNode
  value: ReactNode
  label: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)}>
      {icon}
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

export function PodHeader({
  pod,
  clonedPod,
  onClone,
  onReclone,
  onClonedPodChange,
}: {
  pod: Pod
  clonedPod?: ClonedPod | null
  onClone?: () => void
  onReclone?: () => void
  onClonedPodChange?: (clonedPod: ClonedPod | null) => void
}) {
  const taskSummary = clonedPod
    ? createTaskSummary(pod.tasks ?? [], clonedPod.task_states)
    : null

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 mb-1 overflow-hidden rounded-b-[40px] shadow ring-1 ring-border/50">
        <GrainientBackground className="opacity-40" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="mx-auto hidden shrink-0 md:mx-0 lg:block">
            <div className="overflow-hidden rounded-3xl bg-background/85 shadow ring-1 ring-border">
              <Image
                src={pod.image}
                alt={pod.title}
                width={192}
                height={192}
                loading="eager"
                className="block h-auto max-h-40 w-auto max-w-56 sm:max-h-48 sm:max-w-64 md:max-h-56 md:max-w-72"
              />
            </div>
          </div>

          <div className="relative flex flex-1 flex-col md:min-h-56">
            <div className="mb-4 flex justify-end md:absolute md:top-0 md:right-0 md:mb-0">
              {clonedPod == null ? (
                <Button onClick={onClone} disabled={!onClone}>
                  <HugeiconsIcon icon={CopyIcon} data-icon="inline-start" />
                  Clone
                </Button>
              ) : (
                <PodHeaderActions
                  podTitle={pod.title}
                  clonedPod={clonedPod}
                  onReclone={onReclone}
                  onClonedPodChange={onClonedPodChange}
                />
              )}
            </div>

            <div className="flex flex-1 flex-col justify-center">
              <div
                className={cn(
                  "flex flex-col gap-2",
                  clonedPod ? "md:pr-48" : "md:pr-24"
                )}
              >
                <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {pod.title}
                </h1>
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {pod.description}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <FormatPodCreators
                  creators={pod.creators}
                  className="text-sm"
                />

                <Separator
                  orientation="vertical"
                  className="bg-foreground/15"
                />

                <PodHeaderMetaChip
                  icon={
                    <HugeiconsIcon
                      icon={CopyIcon}
                      className="size-4 text-muted-foreground"
                    />
                  }
                  value={pod.clone_count}
                  label="Clones"
                />

                {taskSummary && (
                  <>
                    <Separator
                      orientation="vertical"
                      className="bg-foreground/15"
                    />
                    <PodHeaderMetaChip
                      icon={
                        <CircularProgress
                          size={20}
                          value={taskSummary.progress}
                        >
                          <CircularProgressIndicator>
                            <CircularProgressTrack />
                            <CircularProgressRange />
                          </CircularProgressIndicator>
                        </CircularProgress>
                      }
                      value={`${taskSummary.completed} / ${taskSummary.total}`}
                      label="Tasks"
                    />
                  </>
                )}

                <Separator
                  orientation="vertical"
                  className="bg-foreground/15"
                />

                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {clonedPod ? (
                    <>
                      <span>Cloned</span>
                      <RelativeTimeCard
                        date={clonedPod.cloned_at}
                        side="bottom"
                        delay={50}
                        closeDelay={150}
                      />
                      <span>by</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <PodCreatorIcon creator={clonedPod.owner} size={24} />
                        {clonedPod.owner.label}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Created</span>
                      <RelativeTimeCard
                        date={pod.created_at}
                        side="bottom"
                        delay={50}
                        closeDelay={150}
                      />
                    </>
                  )}
                </div>

                {clonedPod && (
                  <>
                    <Separator
                      orientation="vertical"
                      className="bg-foreground/15"
                    />
                    <ClonedPodStatusHoverCard status={clonedPod.status} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
