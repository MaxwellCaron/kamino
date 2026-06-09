import { apiFetch } from "@/features/auth/api/auth-api"

export type ClusterUsageHistoryTimeframe = "hour" | "day" | "week" | "month"

export type ApiClusterUsageHistoryPoint = {
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

export type ApiClusterUsageHistoryResponse = {
  points: Array<ApiClusterUsageHistoryPoint>
}

export function clusterUsageHistoryQueryOptions(
  timeframe: ClusterUsageHistoryTimeframe
) {
  return {
    queryKey: ["proxmox", "cluster", "usage-history", timeframe] as const,
    queryFn: async (): Promise<ApiClusterUsageHistoryResponse> => {
      const res = await apiFetch(
        `/api/v1/proxmox/cluster/usage-history?timeframe=${timeframe}`
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch cluster usage history: ${res.status}`)
      }
      return res.json()
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
  }
}
