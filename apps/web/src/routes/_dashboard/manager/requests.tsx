import { createFileRoute, redirect } from "@tanstack/react-router"
import { RequestsPage } from "@/components/requests/requests-page"
import { canAccessRequestQueue } from "@/lib/auth/management-permissions"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadRequestsPage } from "@/lib/requests/requests-route-loaders"

export const Route = createFileRoute("/_dashboard/manager/requests")({
  staticData: {
    breadcrumb: { label: "Requests" },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  loader: ({ context }) => preloadRequestsPage(context.queryClient),
  head: () => pageTitle("Requests"),
  component: RequestsPage,
})
