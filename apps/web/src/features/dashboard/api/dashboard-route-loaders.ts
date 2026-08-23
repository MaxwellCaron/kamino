import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { principalProviderQueryOptions } from "@/features/principals/api/principals-api"
import {
  catalogCloneSummariesQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/features/pods/api/clone-pod-api"
import { personalPodQueryOptions } from "@/features/pods/api/personal-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import {
  requesterRequestSummariesQueryOptions,
  requesterRequestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

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
