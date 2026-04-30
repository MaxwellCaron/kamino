import { IconPackages } from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  formatCores,
  getClusterCapacitySummary,
} from "../utils/admin-dashboard"
import { CapacityChart } from "./capacity-donut-chart"
import { AdminNodeTable } from "./admin-node-table"
import type { Capacity } from "../utils/admin-dashboard"
import type { ApiNode } from "@/features/vms/types/vm-types"

export function AdminClusterCard({
  nodes,
  storageByNode,
}: {
  nodes: Array<ApiNode>
  storageByNode: Map<string, Capacity>
}) {
  const clusterCapacity = getClusterCapacitySummary(nodes, storageByNode)

  return (
    <Card className="pb-0.5 xl:col-span-12">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconPackages className="text-muted-foreground" />
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Cluster
          </span>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Aggregate usage across managed Proxmox nodes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-around gap-6 py-6 lg:flex-row lg:gap-0">
          <CapacityChart
            label="CPU"
            used={clusterCapacity.cpuUsed}
            total={clusterCapacity.cpuTotal}
            color="var(--chart-1)"
            formatValue={formatCores}
          />
          <CapacityChart
            label="Memory"
            used={clusterCapacity.memoryUsed}
            total={clusterCapacity.memoryTotal}
            color="var(--chart-2)"
          />
          <CapacityChart
            label="Storage"
            used={clusterCapacity.storage.used}
            total={clusterCapacity.storage.total}
            color="var(--chart-3)"
          />
        </div>

        <div className="-mx-6 mt-6 border-t">
          <AdminNodeTable nodes={nodes} storageByNode={storageByNode} />
        </div>
      </CardContent>
    </Card>
  )
}
