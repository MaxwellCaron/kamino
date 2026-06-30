import { getRouteApi, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PodPage } from "@/features/pods/components/pod-page"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"
import { PreloadOverlay } from "@/components/loading-overlay"

const podSlugRouteApi = getRouteApi("/_pods/pods/$podSlug")
export function PodSlugPage() {
  const { user } = podSlugRouteApi.useRouteContext()
  const { podSlug } = podSlugRouteApi.useParams()
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

  const isPreloading = isPodLoading || isClonedPodLoading
  if (isPodError) {
    if (isApiErrorStatus(podError, 404)) {
      throw notFound()
    }
    throw podError
  }

  if (!isPreloading && !pod) {
    throw notFound()
  }

  if (isClonedPodError) {
    if (isApiErrorStatus(clonedPodError, 404)) {
      throw notFound()
    }
    throw clonedPodError
  }

  const clonedPod = clonedPodData ?? null
  return (
    <div className="relative flex h-full flex-1 flex-col">
      <PreloadOverlay active={isPreloading} />
      {pod && (
        <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
      )}
    </div>
  )
}
