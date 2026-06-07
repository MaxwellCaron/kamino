import { createFileRoute, redirect } from "@tanstack/react-router"
import { PublishedPodsPage } from "@/features/pods/components/published/published-pods-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"

export const Route = createFileRoute("/_pods/pods/published")({
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods/browse" })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <PublishedPodsPage />
}
