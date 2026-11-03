import { PodSlugPage } from "@/features/pods/components/pod-slug-page"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { podCatalogEntryQueryOptions } from "@/features/pods/api/publish-pod-api"

export const Route = createFileRoute("/_pods/pods/$podSlug")({
  loader: async ({ context, params }) => {
    const [pod] = await Promise.all([
      context.queryClient
        .ensureQueryData(podCatalogEntryQueryOptions(params.podSlug))
        .catch(() => null),
      context.queryClient
        .ensureQueryData(clonedPodQueryOptions(params.podSlug))
        .catch(() => null),
    ])

    return {
      title: pod?.title ?? null,
      breadcrumbs: [{ label: pod?.title ?? params.podSlug }],
    }
  },
  head: ({ loaderData }) => pageTitle(loaderData?.title ?? "Pod"),
  component: PodSlugPage,
})
