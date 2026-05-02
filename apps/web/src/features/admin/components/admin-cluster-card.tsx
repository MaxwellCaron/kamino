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
  formatCores,
  getClusterCapacitySummary,
} from "../utils/admin-dashboard"
import { UsageAreaChart } from "./usage-charts"
import { AdminNodeTable } from "./admin-node-table"
import type { Capacity } from "../utils/admin-dashboard"
import type { ApiNode } from "@/features/vms/types/vm-types"
import type { ClusterUsageHistoryTimeframe } from "../api/admin-metrics-api"

function normalizeTimeframe(value: string): ClusterUsageHistoryTimeframe {
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
  const [timeframe, setTimeframe] =
    useState<ClusterUsageHistoryTimeframe>("hour")
  const historyQuery = useQuery(clusterUsageHistoryQueryOptions(timeframe))
  const clusterCapacity = getClusterCapacitySummary(nodes, storageByNode)
  const history = historyQuery.data?.points ?? []
  const cpuHistory = history.map((point) => ({
    date: new Date(point.time * 1000),
    value: point.cpu_percent,
    used: point.cpu_used,
    total: point.cpu_total,
  }))
  const memoryHistory = history.map((point) => ({
    date: new Date(point.time * 1000),
    value: point.memory_percent,
    used: point.memory_used,
    total: point.memory_total,
  }))
  const storageHistory = history.map((point) => ({
    date: new Date(point.time * 1000),
    value: point.storage_percent,
    used: point.storage_used,
    total: point.storage_total,
  }))
  const historyError = historyQuery.error
  const historyUnavailableMessage = useMemo(() => {
    if (historyError instanceof Error) {
      return historyError.message
    }
    return historyQuery.isLoading
      ? "Loading history..."
      : "History unavailable."
  }, [historyError, historyQuery.isLoading])

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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-6 py-3">
          <Card className="bg-muted/50 ring-0">
            <CardContent>
              <UsageAreaChart
                label="CPU"
                used={clusterCapacity.cpuUsed}
                total={clusterCapacity.cpuTotal}
                color="var(--chart-1)"
                formatValue={formatCores}
                history={cpuHistory}
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
                history={memoryHistory}
                timeframe={timeframe}
                unavailableMessage={historyUnavailableMessage}
              />
            </CardContent>
          </Card>
          <Card className="bg-muted/50 ring-0">
            <CardContent>
              <UsageAreaChart
                label="Storage"
                used={clusterCapacity.storage.used}
                total={clusterCapacity.storage.total}
                color="var(--chart-3)"
                history={storageHistory}
                timeframe={timeframe}
                unavailableMessage={historyUnavailableMessage}
              />
            </CardContent>
          </Card>
        </div>

        <div className="-mx-6 mt-6 border-t">
          <AdminNodeTable nodes={nodes} storageByNode={storageByNode} />
        </div>
      </CardContent>
    </Card>
  )
}
