import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
} from "@workspace/ui/components/circular-progress"
import type { ClonedPod, Pod } from "@/lib/pods/pod-types"
import { ClonedPodStatusHoverCard } from "@/components/pods/cloned-pod-status-badge"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { PodCreatorIcon } from "@/components/pods/pod-creators"
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
  const questionSummary = clonedPod.question_summary

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CopyIcon} className="text-muted-foreground" />
            <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Your Clone
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
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-muted-foreground">Cloned at</dt>
            <dd className="flex min-h-6 items-center">
              <RelativeTimeCard
                date={clonedPod.cloned_at}
                side="bottom"
                delay={50}
                closeDelay={150}
                className="text-foreground"
              />
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-muted-foreground" text-muted-foreground>
              Cloned by
            </dt>
            <dd className="flex min-h-6 items-center gap-2">
              <PodCreatorIcon creator={clonedPod.owner} size={24} />
              <span className="wrap-break-words min-w-0">
                {clonedPod.owner.label}
              </span>
            </dd>
          </div>
          {pod.tasks.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <dt className="text-muted-foreground">Questions</dt>
              <dd className="flex min-h-6 items-center gap-2">
                <CircularProgress size={20} value={questionSummary.progress}>
                  <CircularProgressIndicator>
                    <CircularProgressTrack />
                    <CircularProgressRange />
                  </CircularProgressIndicator>
                </CircularProgress>
                <span className="font-medium tabular-nums">
                  {questionSummary.answered} / {questionSummary.total}
                </span>
                <span>answered</span>
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
      <Separator />
      <PodNetworkDetails network={clonedPod.network} />
      <Separator />
      <PodVms
        network={clonedPod.network}
        vms={clonedPod.vms}
        readOnly={actionsDisabled}
      />
    </Card>
  )
}
