import { createFileRoute, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { PodPage } from "@/features/pods/components/pod-page"
import { clonedPods } from "@/features/pods/types/test-data"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"

export const Route = createFileRoute("/_pods/pods/$podSlug")({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const { podSlug } = Route.useParams()
  const podQuery = useQuery(podCatalogEntryQueryOptions(podSlug))

  if (podQuery.isLoading) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (podQuery.isError || !podQuery.data) {
    throw notFound()
  }

  const pod = podQuery.data
  const clonedPod = clonedPods.find((p) => p.pod_id === pod.id) ?? null

  return <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
}
