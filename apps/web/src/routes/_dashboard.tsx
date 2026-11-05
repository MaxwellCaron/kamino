import { createFileRoute, redirect } from "@tanstack/react-router"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: async ({ context, location }) => {
    try {
      const session = await context.queryClient.fetchQuery(
        authSessionQueryOptions
      )
      return { user: session.user }
    } catch {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      })
    }
  },
  component: DashboardLayout,
})
