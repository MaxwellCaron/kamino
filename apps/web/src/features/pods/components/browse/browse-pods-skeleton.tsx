import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardFooter,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCorner,
  cutoutCardSurfaceClassName,
} from "@workspace/ui/components/cutout-card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

export const browsePodsGridClassName =
  "grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 xl:gap-12"

export function BrowsePodsGridSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading pods"
      className={browsePodsGridClassName}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <BrowsePodsCardSkeleton key={index} />
      ))}
    </div>
  )
}

function BrowsePodsCardSkeleton() {
  return (
    <CutoutCard
      className={cn(cutoutCardSurfaceClassName, "cursor-default")}
      trackPointerHover={false}
    >
      <CutoutCardMedia className="h-72 bg-muted/50">
        <Skeleton className="size-full rounded-none" />
        <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-5 py-3">
          <Skeleton className="h-3 w-20 rounded-md" />
          <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
          <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
        </CutoutCardInsetLabel>
      </CutoutCardMedia>
      <CutoutCardContent>
        <div className="mb-2 flex flex-col gap-2">
          <Skeleton className="h-6 w-4/5 rounded-md" />
          <Skeleton className="h-6 w-3/5 rounded-md" />
        </div>
        <div className="mb-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
        <CutoutCardFooter className="border-t border-border/80 pt-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>
          <Skeleton className="h-4 w-20 rounded-md" />
        </CutoutCardFooter>
      </CutoutCardContent>
    </CutoutCard>
  )
}
