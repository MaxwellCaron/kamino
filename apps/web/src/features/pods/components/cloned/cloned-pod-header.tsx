import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
} from "@workspace/ui/components/circular-progress"
import {
  IconDotsVertical,
  IconPackageExport,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type { ClonedPod } from "@/features/pods/types/pod-types"
import { FormatClonedPodCreators } from "@/features/pods/components/creators"
import { GrainientBackground } from "@/components/grainient-background"

export function ClonedPodHeader({ pod }: { pod: ClonedPod }) {
  return (
    <div className="relative overflow-hidden border-b bg-muted/30">
      <GrainientBackground className="opacity-40" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="flex flex-1 flex-col">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {pod.title}
                </h1>
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {pod.description}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <IconDotsVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <IconPlayerPlay className="size-4" />
                    <span>Start Pod</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <IconPlayerStop className="size-4" />
                    <span>Stop Pod</span>
                  </DropdownMenuItem>
                  <Separator className="my-1" />
                  <DropdownMenuItem variant="destructive">
                    <IconTrash className="size-4" />
                    <span>Delete Pod</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <FormatClonedPodCreators creators={pod.creators} />

              <Separator orientation="vertical" />

              <div className="flex items-center gap-1.5 text-sm">
                <IconPackageExport className="size-4 text-muted-foreground" />
                <span className="font-medium">{pod.clones}</span>
                <span className="text-muted-foreground">Clones</span>
              </div>

              {pod.tasks && (
                <>
                  <Separator orientation="vertical" />
                  <div className="flex items-center gap-2.5">
                    <CircularProgress size={20} value={pod.tasks.progress}>
                      <CircularProgressIndicator>
                        <CircularProgressTrack />
                        <CircularProgressRange />
                      </CircularProgressIndicator>
                    </CircularProgress>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium">
                        {pod.tasks.completed} / {pod.tasks.total}
                      </span>
                      <span className="text-muted-foreground">Tasks</span>
                    </span>
                  </div>
                </>
              )}

              <Separator orientation="vertical" />

              <div className="text-sm text-muted-foreground">
                Cloned{" "}
                <RelativeTimeCard
                  date={pod.cloned_at}
                  side="top"
                  delay={50}
                  closeDelay={150}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
