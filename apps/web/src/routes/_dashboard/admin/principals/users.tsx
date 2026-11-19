import { UsersPage } from "@/components/principals/users/users-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadUsersPage } from "@/lib/principals/principal-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/principals/users")({
  staticData: {
    breadcrumb: { label: "Users" },
  },
  loader: ({ context }) => preloadUsersPage(context.queryClient),
  head: () => pageTitle("Users"),
  component: UsersPage,
})
