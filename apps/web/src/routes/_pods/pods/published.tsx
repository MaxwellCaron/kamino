import { createFileRoute, redirect } from "@tanstack/react-router"
import { preloadPublishedPodsPage } from "@/features/pods/api/pod-route-loaders"
import { PublishedPodsPage } from "@/features/pods/components/published/published-pods-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/published")({
  staticData: {
    breadcrumb: { label: "Published" },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods" })
    }
  },
  loader: ({ context }) => preloadPublishedPodsPage(context.queryClient),
  head: () => pageTitle("Published Pods"),
  component: PublishedPodsPage,
})
