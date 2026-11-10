import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/lib/principals/principals-api"
import {
  publishPodOptionsQueryOptions,
  publishedPodQueryOptions,
  publishedPodsQueryOptions,
} from "@/lib/pods/publish-pod-api"
import type { QueryClient } from "@tanstack/react-query"
import { createPodOptionsQueryOptions } from "@/lib/pods/create-pod-api"
import { podCloneTargetsQueryOptions } from "@/lib/pods/clone-targets-api"

export async function preloadCreatePodPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(createPodOptionsQueryOptions),
  ])
}

export async function preloadPublishedPodsPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(publishedPodsQueryOptions),
    queryClient.ensureQueryData(podCloneTargetsQueryOptions),
  ])
}

export async function preloadPublishPodPage(
  queryClient: QueryClient,
  publishedPodId?: string
) {
  await Promise.allSettled([
    ...(publishedPodId
      ? [queryClient.ensureQueryData(publishedPodQueryOptions(publishedPodId))]
      : []),
    queryClient.ensureQueryData(publishPodOptionsQueryOptions(publishedPodId)),
    queryClient.ensureQueryData(usersQueryOptions),
    queryClient.ensureQueryData(groupsQueryOptions),
  ])
}
