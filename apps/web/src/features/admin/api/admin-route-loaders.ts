import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  requestSummariesQueryOptions,
  requestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"

async function preloadClusterCapacity(queryClient: QueryClient) {
  const nodes = await queryClient.ensureQueryData(nodesQueryOptions)

  await Promise.allSettled(
    nodes.map((node) =>
      queryClient.ensureQueryData(storagesQueryOptions(node.node))
    )
  )
}

export async function preloadAdminDashboard(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(usersQueryOptions),
    queryClient.ensureQueryData(groupsQueryOptions),
    queryClient.ensureQueryData(inventoryTreeQueryOptions),
    queryClient.ensureQueryData(requestSummariesQueryOptions("pending")),
    queryClient.ensureQueryData(requestSummaryCountQueryOptions("pending")),
    queryClient.ensureQueryData(requestSummaryCountQueryOptions("completed")),
    preloadClusterCapacity(queryClient),
  ])
}
