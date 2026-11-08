import { AdminDashboardPage } from "@/components/admin/admin-dashboard-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadAdminDashboard } from "@/lib/admin/admin-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/")({
  loader: ({ context }) => preloadAdminDashboard(context.queryClient),
  head: () => pageTitle("Admin"),
  component: AdminDashboardRoute,
})

function AdminDashboardRoute() {
  const { user } = Route.useRouteContext()

  return <AdminDashboardPage user={user} />
}
