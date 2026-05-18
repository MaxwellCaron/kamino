import { createFileRoute, notFound } from "@tanstack/react-router"
import { ClonedPodPage } from "@/features/pods/components/cloned/cloned-pod-page"
import { clonedPods, pods } from "@/features/pods/types/test-data"

export const Route = createFileRoute("/_dashboard/pods/$podId")({
  component: RouteComponent,
  loader: ({ params }) => {
    const pod = pods.find((p) => p.id === params.podId)
    if (!pod) {
      throw notFound()
    }

    return {
      pod,
      clonedPod: clonedPods.find((p) => p.id === params.podId) ?? null,
    }
  },
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const { pod, clonedPod } = Route.useLoaderData()

  return (
    <ClonedPodPage pod={pod} clonedPod={clonedPod} username={user.username} />
  )
}
