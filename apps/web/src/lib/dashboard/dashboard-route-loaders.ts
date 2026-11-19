import {
  catalogCloneSummariesQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/lib/pods/clone-pod-api"
import {
  requesterRequestSummariesQueryOptions,
  requesterRequestSummaryCountQueryOptions,
} from "@/lib/requests/requests-api"
import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"
import { personalPodQueryOptions } from "@/lib/pods/personal-pod-api"
import { podCatalogQueryOptions } from "@/lib/pods/publish-pod-api"
import { principalProviderQueryOptions } from "@/lib/principals/principals-api"
import { vmStatusQueryOptions } from "@/lib/vms/vm-api"

export async function preloadUserDashboard(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(inventoryTreeQueryOptions),
    queryClient.ensureQueryData(principalProviderQueryOptions),
    queryClient.ensureQueryData(personalPodQueryOptions),
    queryClient.ensureQueryData(requesterRequestSummariesQueryOptions("pending")),
    queryClient.ensureQueryData(requesterRequestSummaryCountQueryOptions("pending")),
    queryClient.ensureQueryData(requesterRequestSummariesQueryOptions("history")),
    queryClient.ensureQueryData(podCatalogQueryOptions),
    queryClient.ensureQueryData(podQuestionActivityQueryOptions()),
    queryClient.ensureQueryData(catalogCloneSummariesQueryOptions()),
    queryClient.ensureQueryData(vmStatusQueryOptions),
  ])
}
