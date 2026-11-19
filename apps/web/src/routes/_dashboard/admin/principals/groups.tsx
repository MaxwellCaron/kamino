import { GroupsPage } from "@/components/principals/groups/groups-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadGroupsPage } from "@/lib/principals/principal-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
  staticData: {
    breadcrumb: { label: "Groups" },
  },
  loader: ({ context }) => preloadGroupsPage(context.queryClient),
  head: () => pageTitle("Groups"),
  component: GroupsPage,
})
