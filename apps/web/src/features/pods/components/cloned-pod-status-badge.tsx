import { Badge } from "@workspace/ui/components/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import type { ClonedPodStatus } from "@/features/pods/types/pod-types"
import type { ComponentProps } from "react"

type ClonedPodStatusConfig = {
  status: ClonedPodStatus
  className: string
  description: string
}

const clonedPodStatuses = [
  "running",
  "partial",
  "stopped",
] as const satisfies ReadonlyArray<ClonedPodStatus>

const statusMap: Record<ClonedPodStatus, ClonedPodStatusConfig> = {
  running: {
    status: "running",
    className: "bg-primary",
    description: "All virtual machines in the pod are running.",
  },
  partial: {
    status: "partial",
    className:
      "bg-amber-600/20 dark:bg-amber-400/20 text-amber-600 dark:text-amber-400",
    description:
      "Some virtual machines in the pod are running, while others are not.",
  },
  stopped: {
    status: "stopped",
    className: "bg-destructive/20 text-destructive",
    description: "All virtual machines in the pod are not running.",
  },
}

function formatClonedPodStatusLabel(status: ClonedPodStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export type ClonedPodStatusBadgeProps = Omit<
  ComponentProps<typeof Badge>,
  "children" | "variant"
> & {
  status: ClonedPodStatus
}

export function ClonedPodStatusBadge({
  status,
  className,
  ...props
}: ClonedPodStatusBadgeProps) {
  const current = statusMap[status]
  return (
    <Badge
      {...props}
      variant="default"
      className={cn(current.className, className)}
    >
      {formatClonedPodStatusLabel(status)}
    </Badge>
  )
}

export function ClonedPodStatusHoverCard({
  status,
}: {
  status: ClonedPodStatus
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={10}
        closeDelay={100}
        render={<ClonedPodStatusBadge status={status} />}
      />
      <HoverCardContent className="flex w-100 flex-col gap-3">
        {clonedPodStatuses.map((statusKey) => {
          const config = statusMap[statusKey]

          return (
            <div key={statusKey} className="flex flex-col gap-1">
              <Badge variant="default" className={config.className}>
                {formatClonedPodStatusLabel(statusKey)}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          )
        })}
        <Separator />
        <div className="flex items-center gap-1">
          <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />
          <p className="text-sm">
            Some virtual machines may not be visible to you.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
