import { PodSlugPage } from "@/components/pods/pod-slug-page"
import { clonedPodQueryOptions } from "@/lib/pods/clone-pod-api"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { podCatalogEntryQueryOptions } from "@/lib/pods/publish-pod-api"

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
