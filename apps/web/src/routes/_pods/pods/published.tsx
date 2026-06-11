import { createFileRoute, redirect } from "@tanstack/react-router"
import { PublishedPodsPage } from "@/features/pods/components/published/published-pods-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/published")({
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods/browse" })
    }
  },
  head: () => pageTitle("Published Pods"),
  component: RouteComponent,
})

function RouteComponent() {
  return <PublishedPodsPage />
}
