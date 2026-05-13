import { createFileRoute } from "@tanstack/react-router"
import { ClonedPodPage } from "@/features/pods/components/cloned/cloned-pod-page"

export const Route = createFileRoute("/_dashboard/pods/cloned/test")({
  component: RouteComponent,
})

function RouteComponent() {
  return <ClonedPodPage />
}
