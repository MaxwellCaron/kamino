import { createFileRoute, redirect } from "@tanstack/react-router"
import { canAccessAdmin } from "@/features/auth/utils/management-permissions"
import { AdminLayout } from "@/features/admin/components/admin-layout"

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
