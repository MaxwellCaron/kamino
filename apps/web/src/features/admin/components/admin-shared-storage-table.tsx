import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatUsageBytes } from "../utils/admin-dashboard"
import type { SharedStorageCapacity } from "../utils/admin-dashboard"

const identityColumnClassName = "w-[min(12rem,28vw)] max-w-[12rem]"
const typeColumnClassName = "w-[min(7rem,18vw)] max-w-[7rem]"
const nodesColumnClassName = "w-[min(14rem,32vw)] max-w-[14rem]"

function formatCapacity(capacity: { total: number; used: number }) {
  return `${formatUsageBytes(capacity.used)} / ${formatUsageBytes(capacity.total)}`
}

export function AdminSharedStorageTable({
  sharedStorages,
}: {
  sharedStorages: Array<SharedStorageCapacity>
}) {
  if (sharedStorages.length === 0) {
    return null
  }

  return (
    <div className="border-t">
      <div className="px-6 py-3">
        <h3 className="text-sm font-medium">Shared storage</h3>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[44rem] table-fixed">
          <colgroup>
            <col className={identityColumnClassName} />
            <col className={typeColumnClassName} />
            <col className={nodesColumnClassName} />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="pl-6 font-medium">Storage</TableHead>
              <TableHead className="px-4 font-medium">Type</TableHead>
              <TableHead className="px-4 font-medium">Nodes</TableHead>
              <TableHead className="pr-6 font-medium">Capacity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sharedStorages.map((storage) => (
              <TableRow key={`${storage.type}:${storage.storage}`}>
                <TableCell
                  className="truncate pl-6 font-medium"
                  title={storage.storage}
                >
                  {storage.storage}
                </TableCell>
                <TableCell className="truncate px-4" title={storage.type}>
                  {storage.type}
                </TableCell>
                <TableCell className="px-4">
                  <div className="flex flex-wrap gap-1">
                    {storage.nodes.map((node) => (
                      <Badge
                        className="max-w-full truncate"
                        key={node}
                        title={node}
                        variant="outline"
                      >
                        {node}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="pr-6 tabular-nums">
                  {formatCapacity(storage)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
