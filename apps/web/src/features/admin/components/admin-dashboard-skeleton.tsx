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
  PageSkeleton,
  TableBlockSkeleton,
} from "@/components/loading-skeletons"

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
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
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
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-48 flex-col gap-4 rounded-3xl bg-muted/50 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-md" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-3.5 w-28 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ))}
        </div>

        <div className="-mx-6 mt-6 border-t">
          <TableBlockSkeleton rows={3} />
        </div>
      </CardContent>
    </Card>
  )
}

function AdminActionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:col-span-5">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
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
