import type { QueryClient } from "@tanstack/react-query"
import { clusterUsageHistoryQueryOptions } from "@/features/admin/api/admin-metrics-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  principalProviderQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  catalogCloneSummariesQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/features/pods/api/clone-pod-api"
import { personalPodQueryOptions } from "@/features/pods/api/personal-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import {
  requestSummariesQueryOptions,
  requestSummaryCountQueryOptions,
  requesterRequestSummariesQueryOptions,
  requesterRequestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"
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

export async function preloadAdminDashboard(queryClient: QueryClient) {
  const nodesPromise = queryClient.ensureQueryData(nodesQueryOptions)

  await Promise.allSettled([
    queryClient.ensureQueryData(usersQueryOptions),
    queryClient.ensureQueryData(groupsQueryOptions),
    queryClient.ensureQueryData(inventoryTreeQueryOptions),
    queryClient.ensureQueryData(requestSummariesQueryOptions("pending")),
    queryClient.ensureQueryData(requestSummaryCountQueryOptions("pending")),
    queryClient.ensureQueryData(requestSummaryCountQueryOptions("completed")),
    nodesPromise,
    queryClient.ensureQueryData(clusterUsageHistoryQueryOptions("hour")),
  ])

  const nodes = await nodesPromise.catch(() => null)
  if (nodes) {
    await Promise.allSettled(
      nodes.map((node) =>
        queryClient.ensureQueryData(storagesQueryOptions(node.node))
      )
    )
  }
}
