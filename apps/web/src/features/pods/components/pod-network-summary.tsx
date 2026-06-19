import { Badge } from "@workspace/ui/components/badge"
import type { ClonedPodNetwork } from "@/features/pods/types/pod-types"

export function PodNetworkSummary({
  network,
}: {
  network: ClonedPodNetwork
}) {
  return (
    <section className="flex flex-col gap-3 border-y border-border/60 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-8">
      <div className="flex min-w-0 flex-col gap-1">
        <Badge variant="outline" className="w-fit tabular-nums">
          Network {network.number}
        </Badge>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">VNet</span>
          <span className="font-mono text-sm tabular-nums break-all">
            {network.vnet}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted-foreground">External</span>
        <span className="font-mono text-sm tabular-nums break-all">
          {network.external_subnet}
        </span>
      </div>

      {network.internal_subnet ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Internal</span>
          <span className="font-mono text-sm tabular-nums break-all">
            {network.internal_subnet}
          </span>
        </div>
      ) : null}
    </section>
  )
}
