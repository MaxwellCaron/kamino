import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { clusterUsageHistoryQueryOptions } from "../api/admin-metrics-api"
import {
  buildUsageHistorySeries,
  formatCores,
  formatUsageBytes,
  getClusterCapacitySummary,
} from "../utils/admin-dashboard"
import { UsageAreaChart } from "./usage-charts"
import { AdminNodeTable } from "./admin-node-table"
import type { Capacity } from "../utils/admin-dashboard"
import type { ApiNode } from "@/features/vms/types/vm-types"
import type { UsageHistoryTimeframe } from "../api/admin-metrics-api"

function normalizeTimeframe(value: string): UsageHistoryTimeframe {
  switch (value) {
    case "hour":
      return "hour"
    case "day":
      return "day"
    case "week":
      return "week"
    case "month":
      return "month"
    default:
      return "hour"
  }
}

export function AdminClusterCard({
  nodes,
  storageByNode,
}: {
  nodes: Array<ApiNode>
  storageByNode: Map<string, Capacity>
}) {
  const [timeframe, setTimeframe] = useState<UsageHistoryTimeframe>("hour")
  const {
    data: historyData,
    error: historyError,
    isLoading: isHistoryLoading,
  } = useQuery(clusterUsageHistoryQueryOptions(timeframe))
  const clusterCapacity = getClusterCapacitySummary(nodes, storageByNode)
  const clusterHistory = buildUsageHistorySeries(historyData?.points ?? [])
  const nodeHistoryByNode = useMemo(() => {
    const historyMap = new Map<
      string,
      ReturnType<typeof buildUsageHistorySeries>
    >()

    for (const nodeHistory of historyData?.nodes ?? []) {
      historyMap.set(
        nodeHistory.node,
        buildUsageHistorySeries(nodeHistory.points)
      )
    }

    return historyMap
  }, [historyData?.nodes])
  const historyUnavailableMessage = useMemo(() => {
    if (historyError instanceof Error) {
      return historyError.message
    }
    return "History unavailable."
  }, [historyError])

  return (
    <Card className="pb-0.5 xl:col-span-12">
      <CardHeader>
        <CardTitle>
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Cluster
          </span>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Aggregate usage across managed Proxmox nodes.
        </CardDescription>
        <CardAction>
          <Tabs
            onValueChange={(value) => setTimeframe(normalizeTimeframe(value))}
            value={timeframe}
          >
            <TabsList>
              <TabsTrigger value="hour">1 Hr</TabsTrigger>
              <TabsTrigger value="day">1 Day</TabsTrigger>
              <TabsTrigger value="week">1 Week</TabsTrigger>
              <TabsTrigger value="month">1 Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 py-3 lg:grid-cols-2 2xl:grid-cols-3">
          <Card className="bg-muted/50 ring-0">
            <CardContent>
              <UsageAreaChart
                label="CPU"
                used={clusterCapacity.cpuUsed}
                total={clusterCapacity.cpuTotal}
                color="var(--chart-1)"
                formatValue={formatCores}
                history={clusterHistory.cpu}
                isLoading={isHistoryLoading}
                timeframe={timeframe}
                unavailableMessage={historyUnavailableMessage}
              />
            </CardContent>
          </Card>
          <Card className="bg-muted/50 ring-0">
            <CardContent>
              <UsageAreaChart
                label="Memory"
                used={clusterCapacity.memoryUsed}
                total={clusterCapacity.memoryTotal}
                color="var(--chart-2)"
                formatValue={formatUsageBytes}
                history={clusterHistory.memory}
                isLoading={isHistoryLoading}
                timeframe={timeframe}
                unavailableMessage={historyUnavailableMessage}
              />
            </CardContent>
          </Card>
          <Card className="bg-muted/50 ring-0 lg:col-span-2 2xl:col-span-1">
            <CardContent>
              <UsageAreaChart
                label="Storage"
                used={clusterCapacity.storage.used}
                total={clusterCapacity.storage.total}
                color="var(--chart-3)"
                formatValue={formatUsageBytes}
                history={clusterHistory.storage}
                isLoading={isHistoryLoading}
                timeframe={timeframe}
                unavailableMessage={historyUnavailableMessage}
              />
            </CardContent>
          </Card>
        </div>

        <div className="-mx-6 mt-6 border-t">
          <AdminNodeTable
            isHistoryLoading={isHistoryLoading}
            nodeHistoryByNode={nodeHistoryByNode}
            nodes={nodes}
            storageByNode={storageByNode}
            timeframe={timeframe}
            unavailableMessage="No history"
          />
        </div>
      </CardContent>
    </Card>
  )
}
