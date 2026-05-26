import { useMemo } from "react"
import { toast } from "sonner"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { PublishPodPage } from "@/features/pods/components/publish/publish-pod-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { createInitialPublishPodValues } from "@/features/pods/components/publish/publish-pod-form"
import {
  getPublishedPodCatalogEntry,
  savePublishedPod,
  toPublishPodFormValues,
  usePublishedPodCatalog,
} from "@/features/pods/utils/published-pod-catalog-store"

export const Route = createFileRoute("/_pods/pods/publish")({
  validateSearch: z.object({
    podId: z.string().optional(),
  }),
  beforeLoad: ({ context, search }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods/browse" })
    }

    if (search.podId && !getPublishedPodCatalogEntry(search.podId)) {
      throw redirect({ to: "/pods/published" })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { podId } = Route.useSearch()
  const catalog = usePublishedPodCatalog()
  const existingPod = useMemo(
    () => (podId ? (catalog.find((pod) => pod.id === podId) ?? null) : null),
    [catalog, podId]
  )
  const initialValues = useMemo(
    () =>
      existingPod
        ? toPublishPodFormValues(existingPod)
        : createInitialPublishPodValues(),
    [existingPod]
  )

  return (
    <PublishPodPage
      key={existingPod?.id ?? initialValues.id}
      initialValues={initialValues}
      pendingSubmitState={existingPod ? "updating" : "publishing"}
      submitLabel={existingPod ? "Save Changes" : "Publish"}
      onSubmit={(values) => {
        const savedPod = savePublishedPod(values)

        toast.success(
          existingPod
            ? `${savedPod.title} updated in the mock catalog.`
            : `${savedPod.title} added to the mock catalog.`
        )
      }}
    />
  )
}
