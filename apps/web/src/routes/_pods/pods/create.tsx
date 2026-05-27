import { createFileRoute } from "@tanstack/react-router"
import { CreatePodPage } from "@/features/pods/components/create/create-pod-page"

export const Route = createFileRoute("/_pods/pods/create")({
  component: RouteComponent,
})

function RouteComponent() {
  return <CreatePodPage />
}
