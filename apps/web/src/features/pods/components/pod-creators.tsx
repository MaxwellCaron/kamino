import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@workspace/ui/components/avatar"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { HugeiconsIcon } from "@hugeicons/react"
import type { PodCreator } from "@/features/pods/types/pod-types"
import { UserGroupIcon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"

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
    <div className="flex min-w-0 items-center gap-3">
      <PodCreatorIcon creator={creator} size={32} />
      <span className="wrap-break-words min-w-0 text-sm font-medium text-card-foreground">
        {getCreatorLabel(creator)}
      </span>
    </div>
  )
}

export function PodCreators({
  creators,
  className,
  side = "bottom",
}: {
  creators: Array<PodCreator>
  className?: string
  side?: "top" | "bottom"
}) {
  const [open, setOpen] = useState(false)

  if (creators.length === 0) return null

  const avatars = (
    <AvatarGroup aria-hidden="true" className="shrink-0">
      {creators.map((creator) => (
        <Avatar key={creator.id} size="sm">
          <AvatarFallback>
            <PodCreatorIcon creator={creator} size={24} />
          </AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  )

  if (creators.length === 1) {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 text-sm font-medium text-foreground",
          className
        )}
      >
        {avatars}
        <span className="min-w-0 wrap-anywhere">{creators[0].label}</span>
      </div>
    )
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        render={<button type="button" />}
        delay={50}
        closeDelay={150}
        onClick={() => setOpen(true)}
        aria-label={`${creators.length} Creators: ${creators.map(getCreatorLabel).join(", ")}`}
        aria-expanded={open}
        className={cn(
          "flex min-h-8 items-center gap-2 rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
      >
        {avatars}
        <span className="whitespace-nowrap">{creators.length} Creators</span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side={side}
        alignOffset={-10}
        className="flex max-w-[calc(100vw-2rem)] flex-col gap-3"
      >
        <p className="text-muted-foreground">Creators</p>
        {creators.map((creator) => (
          <PodCreatorRow key={creator.id} creator={creator} />
        ))}
      </HoverCardContent>
    </HoverCard>
  )
}
