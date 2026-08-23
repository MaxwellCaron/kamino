import { createFileRoute, redirect } from "@tanstack/react-router"
import { preloadRequestsPage } from "@/features/requests/api/requests-route-loaders"
import { RequestsPage } from "@/features/requests/components/requests-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"

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
