import {
  Card,
  CardContent,
  CardHeader,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { GrainientBackground } from "@/components/grainient-background"
import { PageSkeleton, TableBlockSkeleton } from "@/components/loading-skeletons"

export function DashboardHomeSkeleton() {
  return (
    <PageSkeleton label="Loading dashboard">
      <Card className="min-h-[90vh] rounded-4xl pt-0">
        <div className="relative h-48 w-full overflow-hidden">
          <GrainientBackground />
        </div>
        <CardHeader className="relative mx-auto -mt-18.5 flex w-full max-w-5xl items-end justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-end gap-4">
            <SkeletonAvatar />
            <div className="min-w-0 pb-2">
              <Skeleton className="h-7 w-40 rounded-md" />
              <Skeleton className="mt-2 h-4 w-28 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-10 w-28 shrink-0 rounded-md" />
        </CardHeader>
        <CardContent className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-4 sm:px-6">
          <div className="flex flex-col gap-3 border-b border-border/60 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-4">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-4 w-32 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
            <div>
              <Skeleton className="h-5 w-24 rounded-md" />
              <div className="mt-3 overflow-hidden rounded-3xl border">
                <TableBlockSkeleton rows={3} />
              </div>
            </div>
            <div>
              <Skeleton className="h-5 w-32 rounded-md" />
              <div className="mt-3 overflow-hidden rounded-3xl border">
                <TableBlockSkeleton rows={3} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageSkeleton>
  )
}

function SkeletonAvatar() {
  return <Skeleton className="size-20 shrink-0 rounded-full" />
}
