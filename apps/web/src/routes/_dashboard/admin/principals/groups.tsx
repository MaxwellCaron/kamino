import { GroupsPage } from "@/features/principals/components/groups/groups-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { preloadGroupsPage } from "@/features/principals/api/principal-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
  staticData: {
    breadcrumb: { label: "Groups" },
  },
  loader: ({ context }) => preloadGroupsPage(context.queryClient),
  head: () => pageTitle("Groups"),
  component: GroupsPage,
})
