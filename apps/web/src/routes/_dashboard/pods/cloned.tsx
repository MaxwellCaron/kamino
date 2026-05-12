import { createFileRoute } from "@tanstack/react-router"
import { ClonedPodsPage } from "@/features/pods/components/cloned/cloned-pods-page"

export const Route = createFileRoute("/_dashboard/pods/cloned")({
  component: RouteComponent,
})

function RouteComponent() {
  return <ClonedPodsPage />
}
