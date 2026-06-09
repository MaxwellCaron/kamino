import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { canAccessAdmin } from "@/features/auth/utils/management-permissions"

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
