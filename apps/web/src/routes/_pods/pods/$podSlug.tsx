import { createFileRoute, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { PodPage } from "@/features/pods/components/pod-page"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { GrainientBackground } from "@/components/grainient-background"

export const Route = createFileRoute("/_pods/pods/$podSlug")({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const { podSlug } = Route.useParams()
  const podQuery = useQuery(podCatalogEntryQueryOptions(podSlug))
  const clonedPodQuery = useQuery(clonedPodQueryOptions(podSlug))

  if (podQuery.isLoading || clonedPodQuery.isLoading) {
    return <PodPageSkeleton />
  }

  if (podQuery.isError || !podQuery.data || clonedPodQuery.isError) {
    throw notFound()
  }

  const pod = podQuery.data
  const clonedPod = clonedPodQuery.data ?? null

  return <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
}

function PodPageSkeleton() {
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-7 w-52 rounded-md" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3.5 rounded-2xl bg-muted/50 px-4 py-3.5"
                >
                  <Skeleton className="size-5 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="h-3.5 w-28 rounded-md" />
                  </div>
                  <Skeleton className="size-4 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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
