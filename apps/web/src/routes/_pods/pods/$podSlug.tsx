import { createFileRoute, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PodPage } from "@/features/pods/components/pod-page"
import { PodPageSkeleton } from "@/features/pods/components/pod-page-skeleton"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/$podSlug")({
  loader: async ({ context, params }) => {
    const pod = await context.queryClient
      .ensureQueryData(podCatalogEntryQueryOptions(params.podSlug))
      .catch(() => null)

    return {
      title: pod?.title ?? null,
    }
  },
  head: ({ loaderData }) => pageTitle(loaderData?.title ?? "Pod"),
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

  if (podQuery.isError) {
    if (isApiErrorStatus(podQuery.error, 404)) {
      throw notFound()
    }

    throw podQuery.error
  }

  if (!podQuery.data) {
    throw notFound()
  }

  if (clonedPodQuery.isError) {
    if (isApiErrorStatus(clonedPodQuery.error, 404)) {
      throw notFound()
    }

    throw clonedPodQuery.error
  }

  const pod = podQuery.data
  const clonedPod = clonedPodQuery.data ?? null

  return <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
}
