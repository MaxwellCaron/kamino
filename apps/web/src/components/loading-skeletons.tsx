import { Skeleton } from "@workspace/ui/components/skeleton"

export function DialogBodySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-18 rounded-2xl" />
      ))}
    </div>
  )
}
