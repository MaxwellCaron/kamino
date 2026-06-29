import type { ApiUsageHistoryPoint } from "../api/admin-metrics-api"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiNode, ApiStorage } from "@/features/vms/types/vm-types"

export type Capacity = {
  total: number
  used: number
}

export type CapacityHistoryPoint = {
  date: Date
  value: number
  used: number
  total: number
}

export function buildUsageHistorySeries(points: Array<ApiUsageHistoryPoint>) {
  return {
    cpu: points.map((point) => ({
      date: new Date(point.time * 1000),
      value: point.cpu_percent,
      used: point.cpu_used,
      total: point.cpu_total,
    })),
    memory: points.map((point) => ({
      date: new Date(point.time * 1000),
      value: point.memory_percent,
      used: point.memory_used,
      total: point.memory_total,
    })),
    storage: points.map((point) => ({
      date: new Date(point.time * 1000),
      value: point.storage_percent,
      used: point.storage_used,
      total: point.storage_total,
    })),
  }
}

export function percentage(used: number, total: number) {
  if (total <= 0 || !Number.isFinite(used) || !Number.isFinite(total)) {
    return 0
  }
  const value = (used / total) * 100
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const decimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0"
  return decimalFormatter.format(value)
}

function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0
}

function requestTimestamp(request: ApiRequestSummary) {
  return timestamp(
    request.reviewed_at ??
      request.executed_at ??
      request.updated_at ??
      request.created_at
  )
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%"
  const clamped = Math.min(100, Math.max(0, value))
  return `${formatDecimal(clamped)}%`
}

export function formatCores(value: number) {
  return `${formatDecimal(value)} CPU`
}

export function formatUsageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${formatDecimal(value)} ${units[unitIndex]}`
}

export function statusBadgeVariant(status: string): "default" | "destructive" {
  return status === "online" ? "default" : "destructive"
}

function sumStorage(storages: Array<ApiStorage> | undefined): Capacity {
  return (storages ?? []).reduce<Capacity>(
    (capacity, storage) => ({
      total: capacity.total + storage.total,
      used: capacity.used + storage.used,
    }),
    { total: 0, used: 0 }
  )
}

function sumCapacities(capacities: Iterable<Capacity>): Capacity {
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
  return principals
    .toSorted(
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
  requests: number
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
