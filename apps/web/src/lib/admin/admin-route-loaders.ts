import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/lib/principals/principals-api"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/lib/vms/proxmox-options-api"
import {
  requestSummariesQueryOptions,
  requestSummaryCountQueryOptions,
} from "@/lib/requests/requests-api"
import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"

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
