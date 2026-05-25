import { IconUsers } from "@tabler/icons-react"
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

export function FormatPodCreatorsShort(creators: Array<PodCreator>) {
  switch (creators.length) {
    case 0:
      return null
    case 1:
      return (
        <div className="flex items-center gap-3">
          <FacehashIcon name={getCreatorLabel(creators[0])} size={32} />
          <span className="text-sm font-medium text-card-foreground">
            {getCreatorLabel(creators[0])}
          </span>
        </div>
      )
    default:
      return (
        <HoverCard>
          <HoverCardTrigger
            className="flex items-center gap-3"
            delay={50}
            closeDelay={150}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
              <IconUsers className="size-4" />
            </span>
            <span className="text-sm font-medium text-card-foreground">
              {creators.length} Creators
            </span>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            side="top"
            alignOffset={-10}
            className="space-y-3"
          >
            <p className="text-muted-foreground">Creators</p>
            {creators.map((creator, index) => (
              <div key={index} className="flex items-center gap-3">
                <FacehashIcon name={getCreatorLabel(creator)} size={32} />
                <span className="text-sm font-medium text-card-foreground">
                  {getCreatorLabel(creator)}
                </span>
              </div>
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
        {creators.map((creator, index) => (
          <Avatar key={index} size="sm">
            <AvatarFallback>
              <FacehashIcon name={getCreatorLabel(creator)} size={24} />
            </AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      {creators.map(getCreatorLabel).join(", ")}
    </div>
  )
}
