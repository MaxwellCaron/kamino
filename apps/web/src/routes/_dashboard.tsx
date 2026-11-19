import { DashboardLayout } from "@/components/app-shell/dashboard-layout"
import { createFileRoute } from "@tanstack/react-router"
import { requireAuthSession } from "@/lib/auth/auth-route-loaders"

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: requireAuthSession,
  component: DashboardLayout,
})
