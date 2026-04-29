import { createFileRoute } from "@tanstack/react-router"
import { AdminDashboardPage } from "@/features/admin/components/admin-dashboard-page"

export const Route = createFileRoute("/_dashboard/admin/")({
  component: AdminDashboardPage,
})
