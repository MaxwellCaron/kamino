import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiNode, ApiStorage } from "@/features/vms/types/vm-types"

export type Capacity = {
  total: number
  used: number
}

export function percentage(used: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0
}

export function requestTimestamp(request: ApiRequestSummary) {
  return timestamp(
    request.reviewed_at ??
      request.executed_at ??
      request.updated_at ??
      request.created_at
  )
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

export function formatCores(value: number) {
  return `${value.toFixed(1)} CPU`
}

export function statusBadgeVariant(status: string): "default" | "destructive" {
  return status === "online" ? "default" : "destructive"
}

export function sumStorage(storages: Array<ApiStorage> | undefined): Capacity {
  return (storages ?? []).reduce<Capacity>(
    (capacity, storage) => ({
      total: capacity.total + storage.total,
      used: capacity.used + storage.used,
    }),
    { total: 0, used: 0 }
  )
}

export function sumCapacities(capacities: Iterable<Capacity>): Capacity {
  let total = 0
  let used = 0

  for (const capacity of capacities) {
    total += capacity.total
    used += capacity.used
  }

  return { total, used }
}

export function buildStorageByNode(
  nodes: Array<ApiNode>,
  storagesByNode: Array<Array<ApiStorage> | undefined>
) {
  const result = new Map<string, Capacity>()

  nodes.forEach((node, index) => {
    result.set(node.node, sumStorage(storagesByNode[index]))
  })

  return result
}

export function getClusterCapacitySummary(
  nodes: Array<ApiNode>,
  storageByNode: Map<string, Capacity>
) {
  return {
    cpuTotal: nodes.reduce((total, node) => total + node.maxcpu, 0),
    cpuUsed: nodes.reduce((total, node) => total + node.cpu * node.maxcpu, 0),
    memoryTotal: nodes.reduce((total, node) => total + node.maxmem, 0),
    memoryUsed: nodes.reduce((total, node) => total + node.mem, 0),
    storage: sumCapacities(storageByNode.values()),
  }
}

export function getRecentRequests(
  requests: Array<ApiRequestSummary>,
  limit = 5,
  predicate: (request: ApiRequestSummary) => boolean = () => true
) {
  return [...requests]
    .filter(predicate)
    .sort((left, right) => requestTimestamp(right) - requestTimestamp(left))
    .slice(0, limit)
}

export function getRecentPrincipals(
  principals: Array<ApiPrincipal>,
  limit = 5
) {
  return [...principals]
    .sort(
      (left, right) => timestamp(right.created_at) - timestamp(left.created_at)
    )
    .slice(0, limit)
}

export type AdminStats = {
  users: number
  groups: number
  folders: number
  vms: number
  templates: number
  pendingRequests: number
}

export function countInventoryStats(
  nodes: Array<ApiTreeNode> | undefined
): Pick<AdminStats, "folders" | "vms" | "templates"> {
  const counts = { folders: 0, vms: 0, templates: 0 }
  if (!nodes) return counts

  function walk(entries: Array<ApiTreeNode>) {
    for (const node of entries) {
      if (node.kind === "folder") {
        counts.folders++
      } else if (node.vm?.is_template) {
        counts.templates++
      } else {
        counts.vms++
      }
      if (node.children?.length) walk(node.children)
    }
  }

  walk(nodes)
  return counts
}

export function formatMutationError(error: unknown) {
  return error instanceof Error ? error.message : "Request action failed"
}
