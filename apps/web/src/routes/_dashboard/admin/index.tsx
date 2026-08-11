import { createFileRoute } from "@tanstack/react-router"
import { AdminDashboardPage } from "@/features/admin/components/admin-dashboard-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/")({
  head: () => pageTitle("Admin"),
  component: AdminDashboardRoute,
})

function AdminDashboardRoute() {
  const { user } = Route.useRouteContext()

  return <AdminDashboardPage user={user} />
}
