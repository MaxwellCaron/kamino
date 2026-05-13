import { createFileRoute } from "@tanstack/react-router"
import { BrowseClonedPodsPage } from "@/features/pods/components/cloned/browse/browse-cloned-pods-page"

export const Route = createFileRoute("/_dashboard/pods/cloned/browse")({
  component: RouteComponent,
})

function RouteComponent() {
  return <BrowseClonedPodsPage />
}
