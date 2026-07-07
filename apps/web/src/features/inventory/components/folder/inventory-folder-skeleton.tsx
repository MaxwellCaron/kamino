import { Skeleton } from "@workspace/ui/components/skeleton"

const PLACEHOLDER_ROWS = ["a", "b", "c", "d"]

export function InventoryFolderSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading folder"
      className="@container/main flex flex-1 flex-col"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 pt-12">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-9 w-64 max-w-full" />
          </div>
          <Skeleton className="size-9 shrink-0 rounded-md" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex flex-col gap-4">
          {PLACEHOLDER_ROWS.map((row) => (
            <div
              key={row}
              className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
            >
              <Skeleton className="size-5 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-48 max-w-full rounded-md" />
                <Skeleton className="h-3.5 w-32 max-w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
