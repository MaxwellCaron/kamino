import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  PageSkeleton,
  TableBlockSkeleton,
} from "@/components/loading-skeletons"

const overviewStatSkeletons = [
  "users",
  "groups",
  "folders",
  "vms",
  "templates",
  "requests",
]

const clusterChartSkeletons = [
  { id: "cpu", labelWidth: "w-10", usageWidth: "w-24" },
  { id: "memory", labelWidth: "w-16", usageWidth: "w-28" },
  { id: "storage", labelWidth: "w-14", usageWidth: "w-32" },
]

const actionSkeletons = ["sync", "users", "groups", "requests"]
const nodeRowSkeletons = ["node-1"]

export function AdminDashboardSkeleton() {
  return (
    <PageSkeleton
      label="Loading admin dashboard"
      contentClassName="xl:grid xl:grid-cols-12"
    >
      <AdminOverviewSkeleton />
      <AdminClusterSkeleton />
      <AdminTableSkeleton className="xl:col-span-7" actionWidth="w-16" />
      <AdminActionsSkeleton />
      <AdminTableSkeleton className="xl:col-span-5" actionWidth="w-24" />
      <AdminTableSkeleton className="xl:col-span-7" actionWidth="w-20" />
    </PageSkeleton>
  )
}

function AdminOverviewSkeleton() {
  return (
    <Card className="xl:col-span-12">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-10 w-72 max-w-full rounded-md" />
        </CardTitle>
        <CardDescription className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
          <Skeleton className="h-4 w-full max-w-sm rounded-md" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {overviewStatSkeletons.map((id) => (
            <div
              key={id}
              className="flex min-h-30 flex-col justify-between rounded-2xl bg-muted/50 p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 shrink-0 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-14 rounded-md" />
                <Skeleton className="h-3.5 w-full rounded-md" />
                <Skeleton className="h-3.5 w-4/5 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function AdminClusterSkeleton() {
  return (
    <Card className="pb-0.5 xl:col-span-12">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-7 w-28 rounded-md" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-full max-w-md rounded-md" />
        </CardDescription>
        <CardAction>
          <Skeleton className="h-9 w-64 max-w-full rounded-md" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-6 py-3">
          {clusterChartSkeletons.map((chart) => (
            <Card key={chart.id} className="bg-muted/50 ring-0">
              <CardContent>
                <ClusterChartSkeleton
                  labelWidth={chart.labelWidth}
                  usageWidth={chart.usageWidth}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="-mx-6 mt-6 border-t">
          <AdminNodeTableSkeleton />
        </div>
      </CardContent>
    </Card>
  )
}

function ClusterChartSkeleton({
  labelWidth,
  usageWidth,
}: {
  labelWidth: string
  usageWidth: string
}) {
  return (
    <section className="grid min-w-0 gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className={`h-4 ${labelWidth} rounded-md`} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className={`h-3.5 ${usageWidth} rounded-md`} />
        </div>
      </div>
      <Skeleton
        className="w-full rounded-lg"
        style={{ aspectRatio: "2.8 / 1" }}
      />
    </section>
  )
}

function AdminNodeTableSkeleton() {
  return (
    <Table className="table-fixed">
      <colgroup>
        <col style={{ width: "4.5rem" }} />
        <col style={{ width: "6rem" }} />
        <col />
        <col />
        <col />
      </colgroup>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead className="pl-6 font-medium">Node</TableHead>
          <TableHead className="px-4 font-medium">Status</TableHead>
          <TableHead className="px-3">CPU</TableHead>
          <TableHead className="px-3">Memory</TableHead>
          <TableHead className="px-3 pr-6">Storage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodeRowSkeletons.map((id) => (
          <TableRow key={id}>
            <TableCell className="pl-6">
              <Skeleton className="h-5 w-14 rounded-md" />
            </TableCell>
            <TableCell className="px-4">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="px-3">
              <NodeMetricSkeleton />
            </TableCell>
            <TableCell className="px-3">
              <NodeMetricSkeleton />
            </TableCell>
            <TableCell className="px-3 pr-6">
              <NodeMetricSkeleton />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function NodeMetricSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="grid min-h-4 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2">
        <Skeleton className="h-3.5 w-full rounded-md" />
        <Skeleton className="h-3.5 w-10 justify-self-end rounded-md" />
      </div>
      <Skeleton
        className="w-full rounded-md"
        style={{ aspectRatio: "9 / 1" }}
      />
    </div>
  )
}

function AdminActionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:col-span-5">
      {actionSkeletons.map((id) => (
        <div
          key={id}
          className="flex min-h-18 items-center gap-4 rounded-3xl bg-card px-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10"
        >
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-36 rounded-md" />
            <Skeleton className="h-3.5 w-full max-w-56 rounded-md" />
          </div>
          <Skeleton className="size-4 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function AdminTableSkeleton({
  actionWidth,
  className,
}: {
  actionWidth: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-7 w-44 rounded-md" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-full max-w-sm rounded-md" />
        </CardDescription>
        <CardAction>
          <Skeleton className={`h-8 ${actionWidth} rounded-md`} />
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <TableBlockSkeleton rows={3} />
      </CardContent>
    </Card>
  )
}
