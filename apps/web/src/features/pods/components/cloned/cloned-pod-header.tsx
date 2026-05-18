import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
} from "@workspace/ui/components/circular-progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Image } from "@unpic/react"
import {
  IconCopy,
  IconDotsVertical,
  IconPackageExport,
  IconPlayerPlay,
  IconPower,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { ClonedPodStatusBadge } from "./cloned-pod-status-badge"
import type { ClonedPod, Pod } from "@/features/pods/types/pod-types"
import { FormatClonedPodCreators } from "@/features/pods/components/creators"
import { GrainientBackground } from "@/components/grainient-background"

function isClonedPod(pod: Pod | ClonedPod): pod is ClonedPod {
  return "cloned_at" in pod
}

export function ClonedPodHeader({
  pod,
  isPreview = false,
  onClone,
}: {
  pod: Pod | ClonedPod
  isPreview?: boolean
  onClone?: () => void
}) {
  const clonedPod = !isPreview && isClonedPod(pod) ? pod : null

  return (
    <div className="relative overflow-hidden border-b bg-muted/30">
      <GrainientBackground className="opacity-40" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="mx-auto hidden shrink-0 md:mx-0 lg:block">
            <div className="overflow-hidden rounded-3xl bg-background/85 shadow ring-1 ring-border">
              <Image
                src={pod.image}
                alt={pod.title}
                width={192}
                height={192}
                className="block h-auto max-h-40 w-auto max-w-56 sm:max-h-48 sm:max-w-64 md:max-h-56 md:max-w-72"
              />
            </div>
          </div>

          <div className="relative flex flex-1 flex-col md:min-h-56 md:pr-14">
            <div className="mb-4 flex justify-end md:absolute md:top-0 md:right-0 md:mb-0">
              {isPreview ? (
                <Button onClick={onClone} disabled={!onClone}>
                  <IconCopy data-icon="inline-start" />
                  Clone
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="secondary" size="icon-lg">
                        <IconDotsVertical />
                      </Button>
                    }
                  />
                  <DropdownMenuContent className="w-full" align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem key="power-on">
                        <Item className="w-full p-2">
                          <ItemMedia variant="icon">
                            <IconPlayerPlay className="size-4 text-muted-foreground" />
                          </ItemMedia>
                          <ItemContent className="gap-0">
                            <ItemTitle>Power On</ItemTitle>
                            <ItemDescription className="leading-none">
                              Power on all of the virtual machines in the pod.
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      </DropdownMenuItem>
                      <DropdownMenuItem key="power-off">
                        <Item className="w-full p-2">
                          <ItemMedia variant="icon">
                            <IconPower className="size-4 text-muted-foreground" />
                          </ItemMedia>
                          <ItemContent className="gap-0">
                            <ItemTitle>Power Off</ItemTitle>
                            <ItemDescription className="leading-none">
                              Safely power off all of the virtual machines in
                              the pod.
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem key="delete" variant="destructive">
                      <Item className="w-full p-2">
                        <ItemMedia variant="icon">
                          <IconTrash className="size-4" />
                        </ItemMedia>
                        <ItemContent className="gap-0">
                          <ItemTitle>Delete Clone</ItemTitle>
                          <ItemDescription className="leading-none">
                            Permanently delete this cloned pod and all of its
                            virtual machines.
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex flex-1 flex-col justify-center">
              <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {pod.title}
                </h1>
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {pod.description}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <FormatClonedPodCreators creators={pod.creators} />

                <Separator orientation="vertical" />

                <div className="flex items-center gap-1.5 text-sm">
                  <IconPackageExport className="size-4 text-muted-foreground" />
                  <span className="font-medium">{pod.clones}</span>
                  <span className="text-muted-foreground">Clones</span>
                </div>

                {clonedPod?.tasks && (
                  <>
                    <Separator orientation="vertical" />
                    <div className="flex items-center gap-2.5">
                      <CircularProgress
                        size={20}
                        value={clonedPod.tasks.progress}
                      >
                        <CircularProgressIndicator>
                          <CircularProgressTrack />
                          <CircularProgressRange />
                        </CircularProgressIndicator>
                      </CircularProgress>
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="font-medium">
                          {clonedPod.tasks.completed} / {clonedPod.tasks.total}
                        </span>
                        <span className="text-muted-foreground">Tasks</span>
                      </span>
                    </div>
                  </>
                )}

                {clonedPod && (
                  <>
                    <Separator orientation="vertical" />
                    <div className="text-sm text-muted-foreground">
                      Cloned{" "}
                      <RelativeTimeCard
                        date={clonedPod.cloned_at}
                        side="top"
                        delay={50}
                        closeDelay={150}
                      />
                    </div>

                    <Separator orientation="vertical" />
                    <ClonedPodStatusBadge status={clonedPod.status} />
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
