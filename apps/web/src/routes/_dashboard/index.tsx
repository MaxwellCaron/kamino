import { createFileRoute } from "@tanstack/react-router"
import { DashboardHomePage } from "@/features/dashboard/components/dashboard-home-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/")({
  head: () => pageTitle("Home"),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user } = Route.useRouteContext()

  return <DashboardHomePage user={user} />
}
