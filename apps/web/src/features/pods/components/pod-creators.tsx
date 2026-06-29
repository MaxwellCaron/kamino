import { HugeiconsIcon } from "@hugeicons/react"
import { UserGroupIcon } from "@hugeicons/core-free-icons"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"
import type { PodCreator } from "@/features/pods/types/pod-types"

function getCreatorLabel(creator: PodCreator) {
  return creator.label
}

export function PodCreatorIcon({
  creator,
  size,
}: {
  creator: Pick<PodCreator, "type" | "label">
  size: 24 | 32
}) {
  if (creator.type === "group") {
    return (
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={UserGroupIcon} className="size-4.5" />
      </span>
    )
  }

  return <FacehashIcon name={creator.label} size={size} />
}

function PodCreatorRow({ creator }: { creator: PodCreator }) {
  return (
    <div className="flex items-center gap-3">
      <PodCreatorIcon creator={creator} size={32} />
      <span className="text-sm font-medium text-card-foreground">
        {getCreatorLabel(creator)}
      </span>
    </div>
  )
}

export function FormatPodCreatorsShort(creators: Array<PodCreator>) {
  switch (creators.length) {
    case 0:
      return null
    case 1:
      return <PodCreatorRow creator={creators[0]} />
    default:
      return (
        <HoverCard>
          <HoverCardTrigger
            className="flex items-center gap-3"
            delay={50}
            closeDelay={150}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={UserGroupIcon} />
            </span>
            <span className="text-sm font-medium text-card-foreground">
              {creators.length} Creators
            </span>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            side="top"
            alignOffset={-10}
            className="flex flex-col gap-3"
          >
            <p className="text-muted-foreground">Creators</p>
            {creators.map((creator) => (
              <PodCreatorRow key={creator.id} creator={creator} />
            ))}
          </HoverCardContent>
        </HoverCard>
      )
  }
}

export function FormatPodCreators({
  creators,
  className,
}: {
  creators: Array<PodCreator>
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <AvatarGroup>
        {creators.map((creator) => (
          <Avatar key={creator.id} size="sm">
            <AvatarFallback>
              <PodCreatorIcon creator={creator} size={24} />
            </AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      {creators.map(getCreatorLabel).join(", ")}
    </div>
  )
}
