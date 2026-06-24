import { createFileRoute, redirect } from "@tanstack/react-router"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import { PodsLayout } from "@/features/pods/components/pods-layout"

export const Route = createFileRoute("/_pods")({
  staticData: {
    breadcrumb: { label: "Pods", link: { to: "/pods" } },
  },
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
  component: PodsLayout,
})
