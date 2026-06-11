import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type PageSkeletonProps = {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  label?: string
}

export function PageSkeleton({
  children,
  className,
  contentClassName,
  label = "Loading page",
}: PageSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn("@container/main flex flex-1 flex-col gap-2", className)}
    >
      <div
        className={cn(
          "flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

function StatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex min-h-28 flex-wrap items-center rounded-2xl bg-muted/50 px-4 py-3.5"
        >
          <Skeleton className="size-5 shrink-0 rounded-md" />
          <div className="ml-3.5 flex flex-1 flex-col gap-3">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SummaryCardSkeleton({
  action = true,
  description = true,
  statCount = 6,
  titleWidth = "w-64",
}: {
  action?: boolean
  description?: boolean
  statCount?: number
  titleWidth?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className={cn("h-10 max-w-full rounded-md", titleWidth)} />
        </CardTitle>
        {description && (
          <CardDescription>
            <Skeleton className="h-4 w-full max-w-md rounded-md" />
          </CardDescription>
        )}
        {action && (
          <CardAction>
            <Skeleton className="size-10 rounded-md" />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <StatGridSkeleton count={statCount} />
      </CardContent>
    </Card>
  )
}

export function TablePageSkeleton({
  actionCount = 1,
  rowCount = 5,
  titleWidth = "w-48",
}: {
  actionCount?: number
  rowCount?: number
  titleWidth?: string
}) {
  return (
    <PageSkeleton label="Loading table">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton
              className={cn("h-10 max-w-full rounded-md", titleWidth)}
            />
            <Skeleton className="h-6 w-12 rounded-full" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-full max-w-sm rounded-md" />
          </CardDescription>
          {actionCount > 0 && (
            <CardAction className="flex items-center gap-2">
              {Array.from({ length: actionCount }, (_, index) => (
                <Skeleton key={index} className="h-10 w-24 rounded-md" />
              ))}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <TableBlockSkeleton rows={rowCount} />
        </CardContent>
      </Card>
    </PageSkeleton>
  )
}

export function TableBlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="border-y">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex min-h-16 flex-col gap-3 border-b px-6 py-4 last:border-b-0 md:grid md:grid-cols-[2rem_1fr_8rem_8rem] md:items-center md:gap-4 md:py-0"
        >
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-5 w-full max-w-sm rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function DialogBodySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-18 rounded-2xl" />
      ))}
    </div>
  )
}

export function SidebarListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 px-2 py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-4 shrink-0 rounded-md" />
          <Skeleton className="h-4 flex-1 rounded-md" />
        </div>
      ))}
    </div>
  )
}
