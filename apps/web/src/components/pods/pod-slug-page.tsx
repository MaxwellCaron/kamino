import {
  clonedPodQueryOptions,
  podProgressQueryOptions,
} from "@/lib/pods/clone-pod-api"
import { getRouteApi, notFound } from "@tanstack/react-router"
import { PodPage } from "@/components/pods/pod-page"
import { isApiErrorStatus } from "@/lib/api/api-error"
import { podCatalogEntryQueryOptions } from "@/lib/pods/publish-pod-api"
import { useQuery } from "@tanstack/react-query"

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
  const {
    data: progress,
    error: progressError,
    isError: isProgressError,
    isLoading: isProgressLoading,
  } = useQuery(podProgressQueryOptions(podSlug))

  const isPreloading = isPodLoading || isClonedPodLoading || isProgressLoading
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

  if (isProgressError) {
    throw progressError
  }

  const clonedPod = clonedPodData ?? null
  return (
    <div className="relative flex h-full flex-1 flex-col">
      {!isPreloading && pod && progress && (
        <PodPage
          pod={pod}
          clonedPod={clonedPod}
          progress={progress}
          username={user.username}
        />
      )}
    </div>
  )
}
