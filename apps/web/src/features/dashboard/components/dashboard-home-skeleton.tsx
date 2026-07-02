import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { GrainientBackground } from "@/components/grainient-background"
import {
  PageSkeleton,
  TableBlockSkeleton,
} from "@/components/loading-skeletons"
import { BrowsePodsCardSkeleton } from "@/features/pods/components/browse/browse-pods-skeleton"

export function DashboardHomeSkeleton() {
  return (
    <PageSkeleton label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <StatsGridSkeleton className="xl:col-span-7" />
        <ProfileCardSkeleton className="xl:col-span-5" />
        <QuestionActivitySkeleton className="xl:col-span-4" />
        <ClonedPodSkeleton className="xl:col-span-8" />
        <PublishedPodsSkeleton className="xl:col-span-7" />
        <FavoritesSkeleton className="xl:col-span-5" />
        <ActivityTableSkeleton className="xl:col-span-12" />
      </div>
    </PageSkeleton>
  )
}

function StatsGridSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-h-36">
          <CardHeader className="pb-2">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="mt-4 h-4 w-24 rounded-md" />
            <Skeleton className="h-10 w-16 rounded-md" />
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

function ProfileCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full overflow-hidden rounded-4xl pt-0", className)}>
      <div className="relative h-28 w-full overflow-hidden">
        <GrainientBackground />
      </div>
      <CardHeader className="relative mx-auto -mt-18.5 flex w-full justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-end gap-4">
          <Skeleton className="size-20 shrink-0 rounded-full" />
          <div className="min-w-0 pb-2">
            <Skeleton className="h-7 w-36 rounded-md" />
            <Skeleton className="mt-2 h-4 w-24 rounded-md" />
          </div>
        </div>
        <CardAction className="flex shrink-0 flex-wrap justify-end gap-2 self-end pb-2">
          <Skeleton className="h-10 w-28 rounded-md" />
        </CardAction>
      </CardHeader>
    </Card>
  )
}

function QuestionActivitySkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <DashboardSkeletonHeader titleWidth="w-48" descriptionWidth="w-44" />
      <CardContent>
        <div className="flex w-full flex-col gap-3">
          <Skeleton className="h-42 w-full rounded-3xl" />
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="size-3 rounded-sm" />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ClonedPodSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <DashboardSkeletonHeader
        action
        titleWidth="w-32"
        descriptionWidth="w-56"
      />
      <CardContent>
        <div className="flex min-h-49 flex-col gap-5 rounded-3xl bg-muted/50 p-4 sm:flex-row">
          <Skeleton className="size-40 shrink-0 rounded-3xl" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <Skeleton className="h-8 w-full max-w-sm rounded-md" />
            <Skeleton className="h-4 w-full max-w-lg rounded-md" />
            <Skeleton className="h-4 w-28 rounded-md" />
            <div className="pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-4 w-36 rounded-md" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PublishedPodsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <DashboardSkeletonHeader
        action
        titleWidth="w-40"
        descriptionWidth="w-56"
      />
      <CardContent className="mx-6 h-full rounded-4xl bg-muted/50 p-6">
        <div className="flex gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="min-w-0 flex-1">
              <BrowsePodsCardSkeleton />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FavoritesSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <DashboardSkeletonHeader titleWidth="w-28" descriptionWidth="w-52" />
      <CardContent className="h-full">
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-16 items-center gap-3 rounded-2xl border bg-muted/50 px-4"
            >
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40 max-w-full rounded-md" />
                <Skeleton className="mt-2 h-3 w-20 rounded-md" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityTableSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <DashboardSkeletonHeader titleWidth="w-24" descriptionWidth="w-64" />
      <CardContent className="w-full px-0">
        <div className="flex items-center justify-between gap-6 px-6">
          <Skeleton className="h-10 w-full max-w-sm rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <div className="overflow-hidden py-6">
          <TableBlockSkeleton rows={5} />
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardSkeletonHeader({
  action = false,
  descriptionWidth,
  titleWidth,
}: {
  action?: boolean
  descriptionWidth: string
  titleWidth: string
}) {
  return (
    <CardHeader>
      <CardTitle>
        <Skeleton className={cn("h-8 rounded-md", titleWidth)} />
      </CardTitle>
      <Skeleton className={cn("h-4 rounded-md", descriptionWidth)} />
      {action && (
        <CardAction>
          <Skeleton className="h-10 w-28 rounded-md" />
        </CardAction>
      )}
    </CardHeader>
  )
}
