import { AdminDashboardPage } from "@/features/admin/components/admin-dashboard-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { preloadAdminDashboard } from "@/features/admin/api/admin-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/")({
  loader: ({ context }) => preloadAdminDashboard(context.queryClient),
  head: () => pageTitle("Admin"),
  component: AdminDashboardRoute,
})

function AdminDashboardRoute() {
  const { user } = Route.useRouteContext()

  return <AdminDashboardPage user={user} />
}
