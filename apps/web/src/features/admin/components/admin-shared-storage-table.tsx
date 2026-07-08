import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatUsageBytes,
  sharedStorageHistoryKey,
} from "../utils/admin-dashboard"
import { NodeUsageAreaChart } from "./usage-charts"
import type { UsageHistoryTimeframe } from "../api/admin-metrics-api"
import type {
  CapacityHistoryPoint,
  SharedStorageCapacity,
} from "../utils/admin-dashboard"

const nameColumnClassName = "w-[min(12rem,28vw)] max-w-[12rem]"
const typeColumnClassName = "w-[min(7rem,18vw)] max-w-[7rem]"
const resourceColumnClassName = "px-3"

type SharedStorageHistorySeries = {
  storage: Array<CapacityHistoryPoint>
}

export function AdminSharedStorageTable({
  sharedStorages,
  sharedStorageHistoryByKey,
  timeframe,
  isHistoryLoading,
  unavailableMessage,
}: {
  sharedStorages: Array<SharedStorageCapacity>
  sharedStorageHistoryByKey: Map<string, SharedStorageHistorySeries>
  timeframe: UsageHistoryTimeframe
  isHistoryLoading: boolean
  unavailableMessage: string
}) {
  if (sharedStorages.length === 0) {
    return null
  }

  return (
    <div className="overflow-x-auto border-t">
      <div className="px-6 py-3">
        <h3 className="text-sm font-medium">Shared storage</h3>
      </div>
      <Table className="min-w-4xl table-fixed">
        <colgroup>
          <col className={nameColumnClassName} />
          <col className={typeColumnClassName} />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            <TableHead className="pl-6 font-medium">Name</TableHead>
            <TableHead className="px-4 font-medium">Type</TableHead>
            <TableHead
              className={`${resourceColumnClassName} pr-6 font-medium`}
            >
              Storage
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sharedStorages.map((storage) => {
            const history =
              sharedStorageHistoryByKey.get(sharedStorageHistoryKey(storage))
                ?.storage ?? []

            return (
              <TableRow key={sharedStorageHistoryKey(storage)}>
                <TableCell
                  className="truncate pl-6 font-medium"
                  title={storage.storage}
                >
                  {storage.storage}
                </TableCell>
                <TableCell className="truncate px-4" title={storage.type}>
                  {storage.type}
                </TableCell>
                <TableCell className={`${resourceColumnClassName} pr-6`}>
                  <NodeUsageAreaChart
                    color="var(--chart-3)"
                    formatValue={formatUsageBytes}
                    history={history}
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
