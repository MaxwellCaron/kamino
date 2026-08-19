import type { QueryClient } from "@tanstack/react-query"
import { createPodOptionsQueryOptions } from "@/features/pods/api/create-pod-api"
import { podCloneTargetsQueryOptions } from "@/features/pods/api/clone-targets-api"
import {
  publishPodOptionsQueryOptions,
  publishedPodQueryOptions,
  publishedPodsQueryOptions,
} from "@/features/pods/api/publish-pod-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"

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
