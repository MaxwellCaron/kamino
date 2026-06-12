import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { PageSkeleton } from "@/components/loading-skeletons"

type SkeletonRow = {
  key: string
  className: string
}

export function CreatePodFormSkeleton() {
  return (
    <PageSkeleton
      label="Loading create pod form"
      className="@container/main flex flex-1 flex-col"
      contentClassName="mx-auto w-full max-w-5xl gap-6 px-4 py-6 lg:px-8"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-5 w-full max-w-2xl rounded-md" />
      </div>
      <div className="flex flex-col">
        <CreatePodStepSkeleton
          numberWidth="w-28"
          rows={[
            { key: "personalize-title", className: "h-10 w-full" },
            { key: "personalize-description", className: "h-28 w-full" },
            { key: "personalize-image", className: "h-10 w-full max-w-md" },
          ]}
        />
        <CreatePodStepSkeleton
          numberWidth="w-40"
          rows={[
            { key: "vms-router", className: "h-20 w-full" },
            { key: "vms-templates", className: "h-10 w-full" },
            { key: "vms-selection", className: "h-32 w-full" },
          ]}
        />
        <CreatePodStepSkeleton
          isLast
          numberWidth="w-24"
          rows={[
            { key: "review-summary", className: "h-16 w-full" },
            { key: "review-details", className: "h-16 w-full" },
            { key: "review-submit", className: "h-10 w-full" },
          ]}
        />
      </div>
    </PageSkeleton>
  )
}

function CreatePodStepSkeleton({
  isLast = false,
  numberWidth,
  rows,
}: {
  isLast?: boolean
  numberWidth: string
  rows: Array<SkeletonRow>
}) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      <div className="relative flex justify-center">
        <div
          className={cn(
            "absolute top-8 w-px bg-border",
            isLast ? "bottom-0" : "-bottom-8"
          )}
        />
        <Skeleton className="relative z-10 size-8 rounded-full" />
      </div>
      <div className={cn("min-w-0", isLast ? "pb-6" : "pb-10")}>
        <Skeleton className={cn("mb-4 h-6 rounded-md", numberWidth)} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-5 w-36 rounded-md" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-full max-w-lg rounded-md" />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 border-t pt-6">
            {rows.map((row) => (
              <Skeleton
                key={row.key}
                className={cn("rounded-3xl", row.className)}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
