import { UsersPage } from "@/features/principals/components/users/users-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { preloadUsersPage } from "@/features/principals/api/principal-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/principals/users")({
  staticData: {
    breadcrumb: { label: "Users" },
  },
  loader: ({ context }) => preloadUsersPage(context.queryClient),
  head: () => pageTitle("Users"),
  component: UsersPage,
})
