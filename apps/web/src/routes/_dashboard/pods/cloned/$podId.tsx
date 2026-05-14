import { createFileRoute, notFound } from "@tanstack/react-router"
import { ClonedPodPage } from "@/features/pods/components/cloned/cloned-pod-page"
import { clonedPods } from "@/features/pods/types/test-data"

export const Route = createFileRoute("/_dashboard/pods/cloned/$podId")({
  component: RouteComponent,
  loader: ({ params }) => {
    const pod = clonedPods.find((p) => p.id === params.podId)
    if (!pod) {
      throw notFound()
    }
    return { pod }
  },
})

function RouteComponent() {
  const { pod } = Route.useLoaderData()
  return <ClonedPodPage pod={pod} />
}
