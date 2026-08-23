import { apiJson } from "@/features/shared/api/api-json"

export type UsageHistoryTimeframe = "hour" | "day" | "week" | "month"

export type ApiUsageHistoryPoint = {
  time: number
  cpu_used: number
  cpu_total: number
  cpu_percent: number
  memory_used: number
  memory_total: number
  memory_percent: number
  storage_used: number
  storage_total: number
  storage_percent: number
}

export type ApiNodeUsageHistory = {
  node: string
  points: Array<ApiUsageHistoryPoint>
}

export type ApiSharedStorageUsageHistory = {
  storage: string
  type: string
  source_node: string
  points: Array<ApiUsageHistoryPoint>
}

export type ApiClusterUsageHistoryResponse = {
  points: Array<ApiUsageHistoryPoint>
  nodes: Array<ApiNodeUsageHistory>
  shared_storages: Array<ApiSharedStorageUsageHistory>
}

export function clusterUsageHistoryQueryOptions(
  timeframe: UsageHistoryTimeframe
) {
  return {
    queryKey: ["proxmox", "cluster", "usage-history", timeframe] as const,
    queryFn: (): Promise<ApiClusterUsageHistoryResponse> =>
      apiJson<ApiClusterUsageHistoryResponse>(
        `/api/v1/proxmox/cluster/usage-history?timeframe=${timeframe}`,
        "fetch cluster usage history"
      ),
    staleTime: 300_000,
    refetchInterval: 300_000,
  }
}
