import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { GrainientBackground } from "@/components/grainient-background"

const STEPPER_ITEM_IDS = ["personalize", "access", "vms", "tasks", "preview"]

export function PublishPodFormSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading publish pod form"
      className="@container/main relative flex flex-1 flex-col"
    >
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 mb-1 overflow-hidden rounded-b-[40px] shadow ring-1 ring-border/50">
          <GrainientBackground className="opacity-25" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 lg:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="mx-auto hidden shrink-0 md:mx-0 lg:block">
              <Skeleton className="h-56 w-56 rounded-3xl" />
            </div>

            <div className="relative flex flex-1 flex-col md:min-h-56 md:pr-48">
              <div className="mb-4 flex justify-end md:absolute md:top-0 md:right-0 md:mb-0">
                <Skeleton className="h-10 w-24 rounded-md" />
              </div>

              <div className="flex flex-1 flex-col justify-center">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-12 w-4/5 max-w-xl rounded-md sm:h-14" />
                  <Skeleton className="h-5 w-full max-w-3xl rounded-md" />
                  <Skeleton className="h-5 w-3/4 max-w-2xl rounded-md" />
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-5 w-px rounded-none" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                  <Skeleton className="h-5 w-px rounded-none" />
                  <Skeleton className="h-5 w-28 rounded-md" />
                  <Skeleton className="h-5 w-px rounded-none" />
                  <Skeleton className="h-5 w-24 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-md" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-full max-w-lg rounded-md" />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 border-t pt-6">
            <Skeleton className="h-10 w-full rounded-3xl" />
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-10 w-full max-w-md rounded-3xl" />
            <Skeleton className="h-10 w-full rounded-3xl" />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-6 z-50 mx-auto w-full max-w-500 px-2 lg:px-6">
        <Card className="bg-muted">
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center">
              {STEPPER_ITEM_IDS.map((item, index) => (
                <div
                  key={item}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <Skeleton className="size-8 rounded-full bg-card" />
                    <Skeleton className="hidden h-4 w-14 rounded-md md:block" />
                  </div>
                  {index < STEPPER_ITEM_IDS.length - 1 ? (
                    <Skeleton className="mx-4 h-px flex-1 rounded-none" />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-10 w-28 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
