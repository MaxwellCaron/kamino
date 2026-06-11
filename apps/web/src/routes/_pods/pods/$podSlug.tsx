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
  const {
    data: pod,
    error: podError,
    isError: isPodError,
    isLoading: isPodLoading,
  } = useQuery(podCatalogEntryQueryOptions(podSlug))
  const {
    data: clonedPodData,
    error: clonedPodError,
    isError: isClonedPodError,
    isLoading: isClonedPodLoading,
  } = useQuery(clonedPodQueryOptions(podSlug))

  if (isPodLoading || isClonedPodLoading) {
    return <PodPageSkeleton />
  }

  if (isPodError) {
    if (isApiErrorStatus(podError, 404)) {
      throw notFound()
    }

    throw podError
  }

  if (!pod) {
    throw notFound()
  }

  if (isClonedPodError) {
    if (isApiErrorStatus(clonedPodError, 404)) {
      throw notFound()
    }

    throw clonedPodError
  }

  const clonedPod = clonedPodData ?? null

  return <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
}
