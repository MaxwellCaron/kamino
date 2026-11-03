import {
  managerRequestStatusCountsQueryOptions,
  requestsTableQueryOptions,
} from "@/features/requests/api/requests-api"
import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"

const initialTableParams = {
  pageIndex: 0,
  pageSize: 25,
  search: "",
}

export async function preloadRequestsPage(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.ensureQueryData(inventoryTreeQueryOptions),
    queryClient.ensureQueryData(managerRequestStatusCountsQueryOptions()),
    queryClient.ensureQueryData(
      requestsTableQueryOptions("pending", initialTableParams)
    ),
  ])
}
