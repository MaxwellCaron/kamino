import {
  createInitialPublishPodValues,
  toPublishPodFormValues,
} from "@/lib/pods/publish/publish-pod-form"
import { getRouteApi, redirect } from "@tanstack/react-router"
import {
  podCatalogQueryOptions,
  publishedPodQueryOptions,
  publishedPodsQueryOptions,
  savePublishedPod,
} from "@/lib/pods/publish-pod-api"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PublishPodEditor } from "@/components/pods/publish/publish-pod-editor"
import { useMemo } from "react"

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
      existingPodData
        ? toPublishPodFormValues(existingPodData)
        : createInitialPublishPodValues(),
    [existingPodData]
  )

  if (podId && isExistingPodError) {
    throw redirect({ to: "/pods/published" })
  }

  const isPreloading = Boolean(podId) && isExistingPodLoading

  return (
    <div className="relative flex flex-1 flex-col">
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

            return savedPod
          }}
        />
      )}
    </div>
  )
}
