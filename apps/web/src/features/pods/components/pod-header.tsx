import { Button } from "@workspace/ui/components/button"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { GrainientBackground } from "@/components/grainient-background"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Pod } from "@/features/pods/types/pod-types"
import { PodCoverImage } from "./pod-cover-image"
import { PodCreators } from "@/features/pods/components/pod-creators"
import type { ReactNode } from "react"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

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
      <span>{label}</span>
    </div>
  )
}

export function PodHeader({
  pod,
  showClone = true,
  onClone,
}: {
  pod: Pod
  showClone?: boolean
  onClone?: () => void
}) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 mb-1 overflow-hidden rounded-b-[40px] shadow ring-1 ring-border/50">
        <GrainientBackground className="opacity-40" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="mx-auto hidden shrink-0 md:mx-0 lg:block">
            <PodCoverImage
              src={pod.image}
              alt={pod.title}
              loading="eager"
              sizes="(min-width: 1280px) 224px, 192px"
              className="size-48 rounded-3xl shadow xl:h-56 xl:w-45"
            />
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col md:min-h-56">
            {showClone && (
              <div className="mb-4 flex justify-end md:absolute md:top-0 md:right-0 md:mb-0">
                <Button onClick={onClone} disabled={!onClone}>
                  <HugeiconsIcon icon={CopyIcon} data-icon="inline-start" />
                  Clone
                </Button>
              </div>
            )}

            <div className="flex flex-1 flex-col justify-center">
              <div
                className={cn("flex flex-col gap-2", showClone && "md:pr-24")}
              >
                <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {pod.title}
                </h1>
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {pod.description}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Created</span>
                    <RelativeTimeCard
                      date={pod.created_at}
                      delay={50}
                      closeDelay={150}
                      className="text-foreground"
                    />
                    {pod.creators.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>by</span>
                        <PodCreators creators={pod.creators} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
