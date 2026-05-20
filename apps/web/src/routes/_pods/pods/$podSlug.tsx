import { createFileRoute, notFound } from "@tanstack/react-router"
import { PodPage } from "@/features/pods/components/pod-page"
import { clonedPods, pods } from "@/features/pods/types/test-data"

export const Route = createFileRoute("/_pods/pods/$podSlug")({
  component: RouteComponent,
  loader: ({ params }) => {
    const pod = pods.find((p) => p.slug === params.podSlug)
    if (!pod) {
      throw notFound()
    }

    return {
      pod,
      clonedPod: clonedPods.find((p) => p.pod_id === pod.id) ?? null,
    }
  },
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const { pod, clonedPod } = Route.useLoaderData()

  return <PodPage pod={pod} clonedPod={clonedPod} username={user.username} />
}
