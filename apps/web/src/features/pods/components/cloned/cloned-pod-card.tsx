import { Link } from "@tanstack/react-router"
import { Image } from "@unpic/react"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
} from "@workspace/ui/components/circular-progress"
import { IconArrowUpRight, IconPackageExport } from "@tabler/icons-react"
import { Separator } from "@workspace/ui/components/separator"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { FormatClonedPodCreators } from "../creators"
import type { ClonedPod } from "../../types/pod-types"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"

export function ClonedPodCard({ pod }: { pod: ClonedPod }) {
  return (
    <Item
      key={pod.title}
      className="h-full cursor-default shadow ring-1 ring-border"
      variant="muted"
      role="listitem"
      render={
        <Link to=".">
          <ItemMedia variant="image" className="h-90 w-fit">
            <Image src={pod.image} alt={pod.title} width={128} height={128} />
          </ItemMedia>
          <ItemContent className="ml-2 self-start pt-6">
            <ItemTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              {pod.title}
            </ItemTitle>
            <ItemDescription className="leading-7">
              {pod.description}
            </ItemDescription>

            <div className="mt-2 flex items-center gap-4">
              <FormatClonedPodCreators creators={pod.creators} />
              <Separator orientation="vertical" />
              <div className="flex items-center gap-1">
                <IconPackageExport className="size-4" />
                <span className="text-sm">{pod.clones}</span>
              </div>
              <Separator orientation="vertical" />
              <div className="flex items-center gap-2">
                <CircularProgress size={20} value={pod.tasks?.progress}>
                  <CircularProgressIndicator>
                    <CircularProgressTrack />
                    <CircularProgressRange />
                  </CircularProgressIndicator>
                </CircularProgress>
                <span>
                  {pod.tasks?.completed} / {pod.tasks?.total} Tasks
                </span>
              </div>
            </div>

            <div className="mt-6">
              <ItemGroup className="mt-2 grid grid-cols-3">
                {pod.vms.map((vm) => (
                  <Item key={vm.id} className="w-full" variant="outline">
                    <ItemMedia variant="icon">
                      <VmIcon status={vm.status} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{vm.name}</ItemTitle>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          </ItemContent>
          <ItemActions className="self-start">
            <IconArrowUpRight className="size-5 text-muted-foreground" />
          </ItemActions>
          <ItemFooter className="justify-end gap-1 text-muted-foreground">
            Cloned
            <RelativeTimeCard
              date={pod.cloned_at}
              align="end"
              side="top"
              delay={50}
              closeDelay={150}
            />
          </ItemFooter>
        </Link>
      }
    />
  )
}
