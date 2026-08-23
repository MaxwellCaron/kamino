import { createFileRoute } from "@tanstack/react-router"
import { preloadUserDashboard } from "@/features/dashboard/api/dashboard-route-loaders"
import { DashboardHomePage } from "@/features/dashboard/components/dashboard-home-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/")({
  loader: ({ context }) => preloadUserDashboard(context.queryClient),
  head: () => pageTitle("Home"),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user } = Route.useRouteContext()

  return <DashboardHomePage user={user} />
}
