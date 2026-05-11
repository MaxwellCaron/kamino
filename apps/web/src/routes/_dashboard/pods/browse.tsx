import { createFileRoute } from "@tanstack/react-router"
import { BrowsePodsPage } from "@/features/pods/components/browse/browse-pods-page"

export const Route = createFileRoute("/_dashboard/pods/browse")({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = Route.useRouteContext()

  return <BrowsePodsPage username={user.username} />
}
