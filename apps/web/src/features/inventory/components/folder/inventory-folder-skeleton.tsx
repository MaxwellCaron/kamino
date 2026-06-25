import { Skeleton } from "@workspace/ui/components/skeleton"

const PLACEHOLDER_ROWS = ["a", "b", "c", "d"]

export function InventoryFolderSkeleton() {
  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex items-center gap-3 pt-12">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex flex-col gap-4">
          {PLACEHOLDER_ROWS.map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
