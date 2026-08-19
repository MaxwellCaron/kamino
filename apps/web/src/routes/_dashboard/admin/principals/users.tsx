import { createFileRoute } from "@tanstack/react-router"
import { preloadUsersPage } from "@/features/principals/api/principal-route-loaders"
import { UsersPage } from "@/features/principals/components/users/users-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/principals/users")({
  staticData: {
    breadcrumb: { label: "Users" },
  },
  loader: ({ context }) => preloadUsersPage(context.queryClient),
  head: () => pageTitle("Users"),
  component: UsersPage,
})
