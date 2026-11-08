import {
  sdnZonesQueryOptions,
  vnetsQueryOptions,
} from "@/lib/sdn/sdn-api"
import type { QueryClient } from "@tanstack/react-query"
import { podCloneTargetsQueryOptions } from "@/lib/pods/clone-targets-api"

export async function preloadSdnPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(vnetsQueryOptions),
    queryClient.ensureQueryData(sdnZonesQueryOptions),
    queryClient.ensureQueryData(podCloneTargetsQueryOptions),
  ])
}
