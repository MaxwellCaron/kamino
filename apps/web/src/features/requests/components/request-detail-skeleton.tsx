import { Skeleton } from "@workspace/ui/components/skeleton"

export function RequestDetailSkeleton() {
  return (
    <div className="h-125 text-sm text-muted-foreground">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24 rounded-md" />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-18 rounded-2xl" />
        ))}
      </div>
      <div className="flex flex-col gap-4 pt-8">
        <Skeleton className="h-4 w-24 rounded-md" />
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-18 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
