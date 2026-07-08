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
          <TableControlsSkeleton />
          <div className="overflow-hidden py-6">
            <TableBlockSkeleton rows={rowCount} />
          </div>
          <TableFooterSkeleton />
        </CardContent>
      </Card>
    </PageSkeleton>
  )
}

export function TableControlsSkeleton() {
  return (
    <div className="flex items-center justify-between gap-6 px-6">
      <Skeleton className="h-10 w-full max-w-sm rounded-md" />
      <div className="flex items-center gap-2">
        <Skeleton className="hidden h-4 w-24 rounded-md lg:block" />
        <Skeleton className="h-10 w-20 rounded-md" />
      </div>
    </div>
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

export function TableFooterSkeleton() {
  return (
    <div className="flex items-center justify-between px-6">
      <Skeleton className="h-4 w-32 rounded-md" />
      <Skeleton className="h-4 w-24 rounded-md" />
      <div className="flex items-center gap-2">
        <Skeleton className="hidden size-8 rounded-md lg:block" />
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="hidden size-8 rounded-md lg:block" />
      </div>
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
