import { Badge } from "@workspace/ui/components/badge"
import type { ClonedPodStatus } from "@/features/pods/types/pod-types"
import type { ComponentProps } from "react"

const statusBadgeVariant: Record<
  ClonedPodStatus,
  ComponentProps<typeof Badge>["variant"]
> = {
  running: "default",
  partial: "secondary",
  stopped: "destructive",
}

export function ClonedPodStatusBadge({ status }: { status: ClonedPodStatus }) {
  return (
    <Badge variant={statusBadgeVariant[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
