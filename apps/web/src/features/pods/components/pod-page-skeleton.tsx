import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { GrainientBackground } from "@/components/grainient-background"

export function PodPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading pod"
      className="@container/main flex flex-1 flex-col"
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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <Card className="rounded-b-2xl! pb-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
              <Skeleton className="h-4 w-2/3 max-w-xl rounded-md" />
            </CardDescription>
            <CardAction>
              <Skeleton className="h-5 w-12 rounded-full" />
            </CardAction>
          </CardHeader>
          <CardContent className="-mx-6 border-t px-0">
            <div className="divide-y">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-14 items-center gap-3 px-6 py-4"
                >
                  <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                  <Skeleton className="h-5 w-3/5 max-w-lg rounded-md" />
                  <Skeleton className="ml-auto size-4 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
