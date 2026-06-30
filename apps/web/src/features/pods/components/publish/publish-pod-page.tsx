import { useMemo } from "react"
import { toast } from "sonner"
import { getRouteApi, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PublishPodEditor } from "@/features/pods/components/publish/publish-pod-editor"
import { createInitialPublishPodValues } from "@/features/pods/components/publish/publish-pod-form"
import { PreloadOverlay } from "@/components/loading-overlay"
import {
  podCatalogQueryOptions,
  publishedPodQueryOptions,
  publishedPodsQueryOptions,
  savePublishedPod,
  toPublishPodFormValues,
} from "@/features/pods/api/publish-pod-api"

const publishRouteApi = getRouteApi("/_pods/pods/publish")

export function PublishPodPage() {
  const { podId } = publishRouteApi.useSearch()
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

  if (podId && isExistingPodError) {
    throw redirect({ to: "/pods/published" })
  }

  const isPreloading = Boolean(podId) && isExistingPodLoading

  return (
    <div className="relative flex flex-1 flex-col">
      <PreloadOverlay active={isPreloading} />
      {!isPreloading && (
        <PublishPodEditor
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
      )}
    </div>
  )
}
