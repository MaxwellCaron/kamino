import { createFileRoute } from "@tanstack/react-router"
import { DashboardHomePage } from "@/features/dashboard/components/dashboard-home-page"

export const Route = createFileRoute("/_dashboard/")({
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user } = Route.useRouteContext()

  return <DashboardHomePage user={user} />
}
