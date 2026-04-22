import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { canAccessAdmin } from "@/lib/queries"

export const Route = createFileRoute("/_dashboard/admin")({
  beforeLoad: ({ context }) => {
    if (!canAccessAdmin(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return <Outlet />
}
