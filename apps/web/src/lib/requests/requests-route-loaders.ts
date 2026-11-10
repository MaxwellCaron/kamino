import {
  managerRequestStatusCountsQueryOptions,
  requestsTableQueryOptions,
} from "@/lib/requests/requests-api"
import type { QueryClient } from "@tanstack/react-query"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"

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
