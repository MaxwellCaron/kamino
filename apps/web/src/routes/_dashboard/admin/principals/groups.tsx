import { createFileRoute } from "@tanstack/react-router"
import { GroupsPage } from "@/features/principals/components/groups/groups-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/principals/groups")({
  head: () => pageTitle("Groups"),
  component: GroupsPage,
})
