import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { ClonedPod, Pod } from "@/lib/pods/pod-types"
import { ClonedPodStatusHoverCard } from "@/components/pods/cloned-pod-status-badge"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { PodCreators } from "@/components/pods/pod-creators"
import { PodHeaderActions } from "@/components/pods/pod-header-actions"
import { PodNetworkDetails } from "@/components/pods/pod-network-details"
import { PodVms } from "@/components/pods/pod-vms"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { Separator } from "@workspace/ui/components/separator"

export function PodCloneCard({
  pod,
  clonedPod,
  actionsDisabled = false,
  onReclone,
  onClonedPodChange,
}: {
  pod: Pod
  clonedPod: ClonedPod
  actionsDisabled?: boolean
  onReclone?: () => void
  onClonedPodChange?: (clonedPod: ClonedPod | null) => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CopyIcon} className="text-muted-foreground" />
            <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
              My Cloned Pod
            </span>
          </CardTitle>
          <ClonedPodStatusHoverCard status={clonedPod.status} />
        </div>
        <PodHeaderActions
          podTitle={pod.title}
          clonedPod={clonedPod}
          disabled={actionsDisabled}
          onReclone={onReclone}
          onClonedPodChange={onClonedPodChange}
        />
      </CardHeader>
      <Separator />
      <PodNetworkDetails network={clonedPod.network} />
      <Separator />
      <PodVms
        network={clonedPod.network}
        vms={clonedPod.vms}
        readOnly={actionsDisabled}
      />
      <CardFooter className="border-t text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex items-center gap-2">
            Cloned
            <RelativeTimeCard
              date={clonedPod.cloned_at}
              side="top"
              delay={50}
              closeDelay={150}
              className="text-foreground"
            />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            by
            <PodCreators creators={[clonedPod.owner]} />
          </span>
        </div>
      </CardFooter>
    </Card>
  )
}
