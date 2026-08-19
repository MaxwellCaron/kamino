import { createFileRoute } from "@tanstack/react-router"
import { preloadGroupsPage } from "@/features/principals/api/principal-route-loaders"
import { GroupsPage } from "@/features/principals/components/groups/groups-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
  staticData: {
    breadcrumb: { label: "Groups" },
  },
  loader: ({ context }) => preloadGroupsPage(context.queryClient),
  head: () => pageTitle("Groups"),
  component: GroupsPage,
})
