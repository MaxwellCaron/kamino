import { createFileRoute, redirect } from "@tanstack/react-router"
import { AdminLayout } from "@/components/admin/admin-layout"
import { canAccessAdmin } from "@/lib/auth/management-permissions"

export const Route = createFileRoute("/_dashboard/admin")({
  staticData: {
    breadcrumb: { label: "Admin", link: { to: "/admin" } },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessAdmin(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  component: AdminLayout,
})
