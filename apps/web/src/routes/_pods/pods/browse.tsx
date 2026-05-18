import { createFileRoute } from "@tanstack/react-router"
import { BrowsePodsPage } from "@/features/pods/components/clone/browse/browse-pods-page"

export const Route = createFileRoute("/_pods/pods/browse")({
  component: RouteComponent,
})

function RouteComponent() {
  return <BrowsePodsPage />
}
