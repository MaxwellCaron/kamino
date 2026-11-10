import { createFileRoute, redirect } from "@tanstack/react-router"
import { PublishedPodsPage } from "@/components/pods/published/published-pods-page"
import { canAccessRequestQueue } from "@/lib/auth/management-permissions"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadPublishedPodsPage } from "@/lib/pods/pod-route-loaders"

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
