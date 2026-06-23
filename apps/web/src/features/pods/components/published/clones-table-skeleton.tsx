import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function ClonesTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-7">Principal</TableHead>
            <TableHead>Cloned</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="min-w-72">Network</TableHead>
            <TableHead>VMs</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 2 }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className="pl-7">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell className="min-w-72">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-4 w-48 rounded" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-4 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded" />
              </TableCell>
              <TableCell className="pr-7">
                <Skeleton className="size-8 rounded" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
