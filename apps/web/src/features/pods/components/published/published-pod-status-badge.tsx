import { Badge } from "@workspace/ui/components/badge"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import type { PodStatus } from "@/features/pods/types/pod-types"

export function PublishedPodStatusBadge({ status }: { status: PodStatus }) {
  if (status === "listed") {
    return (
      <Badge variant="default">
        <IconEye data-icon="inline-start" />
        Listed
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <IconEyeOff data-icon="inline-start" />
      Unlisted
    </Badge>
  )
}
