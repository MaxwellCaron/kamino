import { createFileRoute } from "@tanstack/react-router"
import { PublishPodPage } from "@/features/pods/components/publish/publish-pod-page"

export const Route = createFileRoute("/_pods/pods/publish")({
  component: RouteComponent,
})

function RouteComponent() {
  return <PublishPodPage />
}
