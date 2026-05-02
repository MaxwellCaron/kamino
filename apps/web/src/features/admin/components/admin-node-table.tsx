import { Badge } from "@workspace/ui/components/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  ProgressIndicator,
  ProgressRoot,
  ProgressTrack,
} from "@workspace/ui/components/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatPercent,
  percentage,
  statusBadgeVariant,
} from "../utils/admin-dashboard"
import type { Capacity } from "../utils/admin-dashboard"
import type { ApiNode } from "@/features/vms/types/vm-types"
import { formatBytes } from "@/features/shared/utils/format"

export function AdminNodeTable({
  nodes,
  storageByNode,
}: {
  nodes: Array<ApiNode>
  storageByNode: Map<string, Capacity>
}) {
  if (nodes.length === 0) {
    return (
      <Empty className="min-h-56 rounded-xl border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="scroll-m-20 text-xl font-semibold tracking-tight">
            No nodes reported
          </EmptyTitle>
          <EmptyDescription className="text-sm text-muted-foreground">
            Proxmox did not return any managed cluster nodes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead className="pl-6 font-medium">Node</TableHead>
          <TableHead className="font-medium">Status</TableHead>
          <TableHead className="font-medium">CPU</TableHead>
          <TableHead className="font-medium">Memory</TableHead>
          <TableHead className="pr-6 font-medium">Storage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node) => {
          const cpuUsed = node.cpu * node.maxcpu
          const memoryValue = percentage(node.mem, node.maxmem)
          const storage = storageByNode.get(node.node) ?? { total: 0, used: 0 }
          const storageValue = percentage(storage.used, storage.total)

          return (
            <TableRow key={node.node}>
              <TableCell className="pl-6 font-medium">{node.node}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(node.status)}>
                  {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex min-w-32 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {cpuUsed.toFixed(1)} CPUs / {node.maxcpu} CPUs
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(node.cpu * 100)}
                    </span>
                  </div>
                  <ProgressRoot value={node.cpu * 100}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-1 dark:bg-chart-1" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-36 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatBytes(node.mem)} / {formatBytes(node.maxmem)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(memoryValue)}
                    </span>
                  </div>
                  <ProgressRoot value={memoryValue}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-2 dark:bg-chart-2" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
              <TableCell className="pr-6">
                <div className="flex min-w-36 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatBytes(storage.used)} / {formatBytes(storage.total)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(storageValue)}
                    </span>
                  </div>
                  <ProgressRoot value={storageValue}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-3 dark:bg-chart-3" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
