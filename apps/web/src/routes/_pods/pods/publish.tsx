import { useMemo } from "react"
import { toast } from "sonner"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { PublishPodPage } from "@/features/pods/components/publish/publish-pod-page"
import { PodPageSkeleton } from "@/features/pods/components/pod-page-skeleton"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { createInitialPublishPodValues } from "@/features/pods/components/publish/publish-pod-form"
import {
  podCatalogQueryOptions,
  publishedPodQueryOptions,
  publishedPodsQueryOptions,
  savePublishedPod,
  toPublishPodFormValues,
} from "@/features/pods/api/publish-pod-api"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/publish")({
  validateSearch: z.object({
    podId: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods/browse" })
    }
  },
  head: () => pageTitle("Publish Pod"),
  component: RouteComponent,
})

function RouteComponent() {
  const { podId } = Route.useSearch()
  const queryClient = useQueryClient()
  const {
    data: existingPodData,
    isError: isExistingPodError,
    isLoading: isExistingPodLoading,
  } = useQuery(publishedPodQueryOptions(podId))
  const existingPod = existingPodData ?? null
  const initialValues = useMemo(
    () =>
      existingPod
        ? toPublishPodFormValues(existingPod)
        : createInitialPublishPodValues(),
    [existingPod]
  )

  if (podId && isExistingPodLoading) {
    return <PodPageSkeleton />
  }

  if (podId && isExistingPodError) {
    throw redirect({ to: "/pods/published" })
  }

  return (
    <PublishPodPage
      key={existingPod?.id ?? initialValues.id}
      initialValues={initialValues}
      publishedPodId={existingPod?.id}
      pendingSubmitState={existingPod ? "updating" : "publishing"}
      submitLabel={existingPod ? "Save Changes" : "Publish"}
      onSubmit={async (values, { progressId }) => {
        const savedPod = await savePublishedPod(values, {
          existing: !!existingPod,
          progressId,
        })
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: publishedPodsQueryOptions.queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: ["pods", "published", savedPod.id],
          }),
          queryClient.invalidateQueries({
            queryKey: podCatalogQueryOptions.queryKey,
          }),
        ])

        toast.success(
          existingPod
            ? `${savedPod.title} updated in the catalog.`
            : `${savedPod.title} added to the catalog.`
        )

        return savedPod
      }}
    />
  )
}
