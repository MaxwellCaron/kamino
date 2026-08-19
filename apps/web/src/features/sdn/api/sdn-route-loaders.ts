import type { QueryClient } from "@tanstack/react-query"
import { podCloneTargetsQueryOptions } from "@/features/pods/api/clone-targets-api"
import {
  sdnZonesQueryOptions,
  vnetsQueryOptions,
} from "@/features/sdn/api/sdn-api"

export async function preloadSdnPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(vnetsQueryOptions),
    queryClient.ensureQueryData(sdnZonesQueryOptions),
    queryClient.ensureQueryData(podCloneTargetsQueryOptions),
  ])
}
