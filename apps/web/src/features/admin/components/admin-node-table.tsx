import { Badge } from "@workspace/ui/components/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatCores,
  formatUsageBytes,
  statusBadgeVariant,
} from "../utils/admin-dashboard"
import { NodeUsageAreaChart } from "./usage-charts"
import type { UsageHistoryTimeframe } from "../api/admin-metrics-api"
import type { Capacity, CapacityHistoryPoint } from "../utils/admin-dashboard"
import type { ApiNode } from "@/features/vms/types/vm-types"

type NodeHistorySeries = {
  cpu: Array<CapacityHistoryPoint>
  memory: Array<CapacityHistoryPoint>
  storage: Array<CapacityHistoryPoint>
}

const resourceColumnClassName = "px-3"

export function AdminNodeTable({
  nodes,
  storageByNode,
  timeframe,
  nodeHistoryByNode,
  isHistoryLoading,
  unavailableMessage,
}: {
  nodes: Array<ApiNode>
  storageByNode: Map<string, Capacity>
  timeframe: UsageHistoryTimeframe
  nodeHistoryByNode: Map<string, NodeHistorySeries>
  isHistoryLoading: boolean
  unavailableMessage: string
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
    <div className="overflow-x-auto">
      <Table className="min-w-4xl table-fixed">
        <colgroup>
          <col className="w-[min(12rem,28vw)] max-w-48" />
          <col className="w-[min(7rem,16vw)] max-w-28" />
          <col />
          <col />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            <TableHead className="pl-6 font-medium">Node</TableHead>
            <TableHead className="px-4 font-medium">Status</TableHead>
            <TableHead className={resourceColumnClassName}>CPU</TableHead>
            <TableHead className={resourceColumnClassName}>Memory</TableHead>
            <TableHead className={`${resourceColumnClassName} pr-6`}>
              Storage
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node) => {
            const cpuUsed = node.cpu * node.maxcpu
            const storage = storageByNode.get(node.node) ?? {
              total: 0,
              used: 0,
            }
            const nodeHistory = nodeHistoryByNode.get(node.node)

            return (
              <TableRow key={node.node}>
                <TableCell
                  className="truncate pl-6 font-medium"
                  title={node.node}
                >
                  {node.node}
                </TableCell>
                <TableCell className="px-4">
                  <Badge
                    className="whitespace-nowrap"
                    variant={statusBadgeVariant(node.status)}
                  >
                    {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className={resourceColumnClassName}>
                  <NodeUsageAreaChart
                    color="var(--chart-1)"
                    formatValue={formatCores}
                    history={nodeHistory?.cpu ?? []}
                    isLoading={isHistoryLoading}
                    label="CPU"
                    timeframe={timeframe}
                    total={node.maxcpu}
                    unavailableMessage={unavailableMessage}
                    used={cpuUsed}
                  />
                </TableCell>
                <TableCell className={resourceColumnClassName}>
                  <NodeUsageAreaChart
                    color="var(--chart-2)"
                    formatValue={formatUsageBytes}
                    history={nodeHistory?.memory ?? []}
                    isLoading={isHistoryLoading}
                    label="Memory"
                    timeframe={timeframe}
                    total={node.maxmem}
                    unavailableMessage={unavailableMessage}
                    used={node.mem}
                  />
                </TableCell>
                <TableCell>
                  <NodeUsageAreaChart
                    color="var(--chart-3)"
                    formatValue={formatUsageBytes}
                    history={nodeHistory?.storage ?? []}
                    isLoading={isHistoryLoading}
                    label="Storage"
                    timeframe={timeframe}
                    total={storage.total}
                    unavailableMessage={unavailableMessage}
                    used={storage.used}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
