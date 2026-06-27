import { Badge } from "@workspace/ui/components/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import type { PodStatus } from "@/features/pods/types/pod-types"

export function PublishedPodStatusBadge({ status }: { status: PodStatus }) {
  if (status === "listed") {
    return (
      <Badge variant="default">
        <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" />
        Listed
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <HugeiconsIcon icon={ViewOffSlashIcon} data-icon="inline-start" />
      Unlisted
    </Badge>
  )
}
